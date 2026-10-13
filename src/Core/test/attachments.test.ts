// E2: attachments are read, never run. Programs and compressed folders are refused by name before anything is fetched;
// a Word document is read with Node's own zlib; pictures go to Claude as pictures; text is fenced as someone else's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { docxText, kindOfFile, readAttachment, safeFileName, unzipOne } from '../src/attachments.ts';

/** A real zip, built by hand: one deflated entry and one stored entry, with a central directory. */
function zip(files: { name: string; data: Buffer; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const f of files) {
    const body = f.store ? f.data : deflateRawSync(f.data);
    const name = Buffer.from(f.name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(f.store ? 0 : 8, 8); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(f.store ? 0 : 8, 10); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, body); central.push(ch, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('programs, scripts, macro documents and compressed folders are never opened', async () => {
  for (const n of ['invoice.exe', 'Setup.MSI', 'run.bat', 'tool.ps1', 'doc.js', 'Form.docm', 'shortcut.lnk', 'app.dmg', 'notes.one']) assert.equal(kindOfFile(n, ''), 'never', n);
  assert.equal(kindOfFile('files.zip', 'application/zip'), 'archive');
  const r = await readAttachment('invoice.pdf.exe', 'application/octet-stream', Buffer.from('MZ'));
  assert.match(r.why ?? '', /never opens those/);
  assert.equal(r.text, undefined);
});

test('a Word document is read: paragraphs, tabs and characters as written', async () => {
  const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Demo brief</w:t></w:r></w:p><w:p><w:r><w:t>Thursday at 2&amp;3</w:t><w:tab/><w:t>R&#233;sum&#xE9;</w:t></w:r></w:p></w:body></w:document>';
  const file = zip([{ name: '[Content_Types].xml', data: Buffer.from('<x/>'), store: true }, { name: 'word/document.xml', data: Buffer.from(xml) }]);
  assert.equal(unzipOne(file, 'nope.xml'), null);
  assert.equal(docxText(file), 'Demo brief\nThursday at 2&3\tRésumé\n');
  const r = await readAttachment('Demo brief.docx', '', file);
  assert.match(r.text ?? '', /^--- attachment "Demo brief.docx" \(someone else's file: DATA/);
  assert.match(r.text ?? '', /Thursday at 2&3\tRésumé/);
  assert.equal(docxText(Buffer.from('not a zip at all')), null, 'a broken file is said to be unreadable, not guessed at');
});

test('pictures go to Claude as pictures; text is fenced; an unknown kind is named, not opened', async () => {
  const png = await readAttachment('map.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.equal(png.image?.mimeType, 'image/png');
  const txt = await readAttachment('notes.txt', 'text/plain', Buffer.from('Bring two case studies.'));
  assert.match(txt.text ?? '', /Bring two case studies\./);
  const odd = await readAttachment('model.stl', 'application/sla', Buffer.from('x'));
  assert.match(odd.why ?? '', /does not read/);
});

test('saved names cannot climb out of Downloads or use reserved names', () => {
  assert.equal(safeFileName('..\\..\\Windows\\evil.pdf'), '.._.._Windows_evil.pdf');
  assert.equal(safeFileName('a/b:c?.pdf'), 'a_b_c_.pdf');
  assert.equal(safeFileName('CON.txt'), '_CON.txt');
  assert.equal(safeFileName('report. '), 'report');
  assert.equal(safeFileName(''), 'attachment');
});

/** A real one-page PDF with text, built by hand with a correct cross-reference table. */
function pdf(text: string): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '', // 4: the content stream, below
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('a PDF is read with unpdf, page by page; a PDF with no text says so', async () => {
  const r = await readAttachment('Demo brief.pdf', 'application/pdf', pdf('Demo Friday October 16 at 2pm'));
  assert.match(r.text ?? '', /\[page 1\]\nDemo Friday October 16 at 2pm/);
  assert.match(r.text ?? '', /someone else's file: DATA/);
  const empty = await readAttachment('scan.pdf', 'application/pdf', pdf(''));
  assert.match(empty.why ?? '', /no text in it \(a scan or pictures\)/);
  const broken = await readAttachment('broken.pdf', 'application/pdf', Buffer.from('%PDF-1.4 not really'));
  assert.match(broken.why ?? '', /could not be read as a PDF/, 'a broken PDF is said to be unreadable');
});

test('E8: videos and voice notes are marked to be heard (on the PC), not read here', () => {
  for (const [n, m] of [['demo.mp4', ''], ['note.m4a', ''], ['call.webm', ''], ['clip', 'video/quicktime'], ['memo', 'audio/mpeg']] as [string, string][])
    assert.equal(kindOfFile(n, m), 'media', n + ' ' + m);
  assert.equal(kindOfFile('setup.exe', 'video/mp4'), 'never', 'a program dressed as a video is still never opened');
});
