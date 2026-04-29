console.log('content.js: injected into the page');

const IDLE_VIDEO_PATH = 'videos/idle.webm';

let runner;

const script = document.createElement('script');
script.src = chrome.runtime.getURL('yarn-bound.min.js');
script.onload = async () => {
  const res = await fetch(chrome.runtime.getURL('demo.yarn'));
  const dialogue = await res.text();
  console.log('yarn-bound.min.js loaded');
  runner = new self.YarnBound({dialogue});
  renderCurrentResult();
  applyUrlTriggers();
  // runner.advance()
  // console.log(runner.currentResult);

};
document.head.appendChild(script);

function wildcardToRegExp(pattern) {
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedPattern.replaceAll('*', '.*')}$`);
}

function urlMatches(pattern) {
  return wildcardToRegExp(pattern).test(window.location.href);
}

function playAnimation(src, { loop = false, returnToIdle = true } = {}) {
  video.loop = loop;
  video.src = chrome.runtime.getURL(src);
  video.currentTime = 0;
  video.play();

  if (returnToIdle && !loop) {
    video.onended = () => {
      video.onended = null;
      video.loop = true;
      video.src = chrome.runtime.getURL(IDLE_VIDEO_PATH);
      video.play();
    };
  }
}

async function applyUrlTriggers() {
  const res = await fetch(chrome.runtime.getURL('triggers.json'));
  const config = await res.json();
  const urlTrigger = config.triggers.find((trigger) => {
    return trigger.type === 'url'
      && Array.isArray(trigger.match)
      && trigger.match.some(urlMatches);
  });

  if (urlTrigger) {
    console.log('urlTrigger', urlTrigger);  
  }

  if (urlTrigger?.yarnNode) {
    runner.jump(urlTrigger.yarnNode);
    renderCurrentResult();
  }
}

function parseCommand(command) {
  const [name, ...tokens] = command.split(/\s+/);
  const args = { positional: [] };

  tokens.forEach((token) => {
    const [key, rawValue] = token.split('=');
    if (key && rawValue !== undefined) {
      args[key] = rawValue.replace(/^"|"$/g, '');
    } else if (token) {
      args.positional.push(token);
    }
  });

  return { name, args };
}

function executeCommand(command) {
  const { name, args } = parseCommand(command);

  if (name === 'DoNothing') {
    return;
  }

  if (name === 'PlayAnimation') {
    const animationName = args.src || args.animation || args.name || args.positional[0];
    const src = animationName.includes('/') ? animationName : `videos/${animationName}.webm`;
    playAnimation(src, {
      loop: args.loop === 'true',
      returnToIdle: args.returnToIdle !== 'false',
    });
  }
}

function renderCurrentResult() {
  console.log(runner.currentResult);

  while (runner.currentResult.command) {
    executeCommand(runner.currentResult.command);
    runner.advance();
  }

  if (runner.currentResult.text) {
    chatText.style.display = 'block';
    chatOptions.style.display = 'none';
    chatText.textContent = runner.currentResult.text;
  } else if (runner.currentResult.options) {
    chatText.style.display = 'none';
    chatOptions.style.display = 'flex';
    chatOptions.innerHTML = runner.currentResult.options.map((opt, idx) => `<div>${idx + 1}. ${opt.text}</div>`).join('\n');
    Array.from(chatOptions.children).forEach((child, idx) => {
      child.className = 'chat-option';
      child.addEventListener('click', () => {
        advanceDialogue(idx);
      });
    });
  } else {
    chatText.style.display = 'none';
    chatOptions.style.display = 'none';
  }
}

function advanceDialogue(idx) {
  if (runner) {
    runner.advance(idx);
    renderCurrentResult();
  }
}

const buddyContainer = document.createElement('div');
buddyContainer.id = 'costar-plugin';
document.body.appendChild(buddyContainer);

const video = document.createElement('video');
video.src = chrome.runtime.getURL(IDLE_VIDEO_PATH);
video.autoplay = true;
video.loop = true;
video.muted = true;
video.className = 'video-player';
buddyContainer.appendChild(video);

const chatBox = document.createElement('div');
chatBox.className = 'chat-box';
buddyContainer.appendChild(chatBox);
chatBox.addEventListener('click', advanceDialogue);

const chatText = document.createElement('div');
chatText.className = 'chat-text';
chatBox.appendChild(chatText);

const chatOptions = document.createElement('div');
chatOptions.className = 'chat-options';
chatBox.appendChild(chatOptions);


// console.log(video);
// console.log(chatBox);
