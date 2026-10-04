// The pop-out's page. It shows what the main process tells it to and nothing else: it holds no
// connection, chooses no address, and cannot open a window.
const what = document.getElementById('what');
const src = document.getElementById('src');
const video = document.getElementById('video');
const empty = document.getElementById('empty');

window.aang.onPopout(v => {
  // No address means this page is only the bar: the video is a separate view underneath it, because
  // paid services refuse to be shown in a frame (step 6.4). With an address, the page shows the video
  // itself, which is how YouTube and Twitch work, since their embed addresses exist to be framed.
  if (v.url) {
    // The address is built in the main process. The page never constructs one.
    video.src = v.url;
    video.hidden = false;
  } else {
    video.hidden = true;
  }
  empty.hidden = true;
  what.textContent = v.title;
  src.textContent = v.label;
  src.hidden = false;
  // Gold for open video, purple for a paid service (sheet 4, section 1).
  src.className = 'src' + (v.source === 'page' ? ' paid' : '');
  document.title = 'Aang: ' + v.title;
});

document.getElementById('hide').addEventListener('click', () => window.aang.popoutHide());
document.getElementById('close').addEventListener('click', () => window.aang.popoutClose());
