import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { vaultDirFor } = await import('../src/files.ts');

test('the PC keeps its Obsidian vault under the Windows profile', () => {
  assert.equal(vaultDirFor({ USERPROFILE: 'C:\\Users\\Shadow' }, 'win32', 'C:\\Users\\Shadow'), 'C:\\Users\\Shadow\\Documents\\CereBro-Vault');
  assert.equal(vaultDirFor({}, 'win32', 'C:\\Users\\Shadow'), 'C:\\Users\\Shadow\\Documents\\CereBro-Vault');
});

test('the Mac uses its own home, never a C:\\ path that turns relative', () => {
  const dir = vaultDirFor({}, 'darwin', '/Users/someone');
  assert.equal(dir, '/Users/someone/Documents/CereBro-Vault');
  assert.ok(path.posix.isAbsolute(dir));
  assert.equal(vaultDirFor({ USERPROFILE: 'C:\\Users\\Shadow' }, 'darwin', '/Users/someone'), dir, 'a stray USERPROFILE on the Mac is ignored');
});

test('AANG_VAULT_DIR wins on both machines', () => {
  assert.equal(vaultDirFor({ AANG_VAULT_DIR: 'D:\\Vault' }, 'win32', 'C:\\Users\\Shadow'), 'D:\\Vault');
  assert.equal(vaultDirFor({ AANG_VAULT_DIR: '/Volumes/Vault' }, 'darwin', '/Users/someone'), '/Volumes/Vault');
});
