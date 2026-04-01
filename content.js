console.log('content.js: injected into the page');

let runner;

const script = document.createElement('script');
script.src = chrome.runtime.getURL('yarn-bound.min.js');
script.onload = async () => {
  const res = await fetch(chrome.runtime.getURL('demo.yarn'));
  const dialogue = await res.text();
  console.log(dialogue);
  console.log('yarn-bound.min.js loaded');
  runner = new self.YarnBound({dialogue});
  console.log(runner.currentResult);
  chatText.textContent = runner.currentResult.text;
  // runner.advance()
  // console.log(runner.currentResult);

};
document.head.appendChild(script);

function advanceDialogue(idx) {
  if (runner) {
    runner.advance(idx);
    console.log(runner.currentResult);
    if (runner.currentResult.text) {
      chatText.style.display = 'block';
      chatOptions.style.display = 'none';
      chatText.textContent = runner.currentResult.text;
    } else if (runner.currentResult.options) {
      chatText.style.display = 'none';
      chatOptions.style.display = 'flex';
      chatOptions.innerHTML = runner.currentResult.options.map((opt, idx) => `<div>${idx + 1}. ${opt.text}</div>`).join('\n');
      Array.from(chatOptions.children).forEach((child, idx) => {
        child.style.cssText = 'flex: 1; padding: 5px; cursor: pointer;';
        child.addEventListener('click', () => {
          advanceDialogue(idx);
        });
      });
    }
  }
}

const buddyContainer = document.createElement('div');
buddyContainer.style.cssText = 'position: fixed; top: 0; right: 0; width: 480px; height: 320px; z-index: 999; pointer-events: none; display: flex; flex-direction: column; align-items: center; justify-content: center;';
document.body.appendChild(buddyContainer);

const video = document.createElement('video');
video.src = chrome.runtime.getURL('videos/default.webm');
video.autoplay = true;
video.loop = true;
video.muted = true;
video.style.cssText = 'width: 480px; height: 270px;';
buddyContainer.appendChild(video);

const chatBox = document.createElement('div');
chatBox.style.cssText = 'width: 480px; height: 50px; background: rgba(0, 0, 0, 0.5); color: white; font-family: sans-serif; font-size: 16px; display: flex; align-items: center; justify-content: center; margin-top: 10px; pointer-events: auto; cursor: pointer;';
buddyContainer.appendChild(chatBox);
chatBox.addEventListener('click', advanceDialogue);

const chatText = document.createElement('div');
chatText.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;';
chatBox.appendChild(chatText);

const chatOptions = document.createElement('div');
chatOptions.style.cssText = 'width: 100%; height: 100%; display: none; align-items: center; justify-content: center;';
chatBox.appendChild(chatOptions);


// console.log(video);
// console.log(chatBox);
