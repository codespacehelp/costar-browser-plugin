console.log('content.js: injected into the page');

const IDLE_VIDEO_PATH = 'videos/idle.webm';

let runner;
let triggerConfig;
const triggeredAt = new Map();

const script = document.createElement('script');
script.src = chrome.runtime.getURL('yarn-bound.min.js');
script.onload = async () => {
  const res = await fetch(chrome.runtime.getURL('demo.yarn'));
  const dialogue = await res.text();
  console.log('yarn-bound.min.js loaded');
  runner = new self.YarnBound({dialogue});
  renderCurrentResult();
  triggerConfig = await loadTriggerConfig();
  applyUrlTriggers();
  watchUrlChanges();
  applyMouseMovementTriggers();
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

async function loadTriggerConfig() {
  const res = await fetch(chrome.runtime.getURL('triggers.json'));
  return res.json();
}

function getTriggerDefaults() {
  return triggerConfig?.defaults || {};
}

function getTriggerKey(trigger) {
  if (trigger.oncePerUrl) {
    return `${trigger.id}:${window.location.href}`;
  }

  return trigger.id;
}

function canRunTrigger(trigger) {
  const defaults = getTriggerDefaults();
  const oncePerPage = trigger.oncePerPage ?? defaults.oncePerPage ?? false;
  const cooldownMs = trigger.cooldownMs ?? defaults.cooldownMs ?? 0;
  const triggerKey = getTriggerKey(trigger);
  const lastTriggeredAt = triggeredAt.get(triggerKey) || 0;

  if (oncePerPage && lastTriggeredAt) {
    return false;
  }

  if (Date.now() - lastTriggeredAt < cooldownMs) {
    return false;
  }

  return true;
}

function runTrigger(trigger) {
  if (!trigger?.yarnNode || !canRunTrigger(trigger)) {
    return;
  }

  triggeredAt.set(getTriggerKey(trigger), Date.now());
  runner.jump(trigger.yarnNode);
  renderCurrentResult();
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

function applyUrlTriggers() {
  const urlTrigger = triggerConfig.triggers.find((trigger) => {
    return trigger.type === 'url'
      && Array.isArray(trigger.match)
      && trigger.match.some(urlMatches);
  });

  if (urlTrigger) {
    console.log('urlTrigger', urlTrigger);  
  }

  runTrigger(urlTrigger);
}

function watchUrlChanges() {
  let currentUrl = window.location.href;

  const handleUrlChange = () => {
    if (window.location.href === currentUrl) {
      return;
    }

    currentUrl = window.location.href;
    applyUrlTriggers();
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    handleUrlChange();
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    handleUrlChange();
    return result;
  };

  window.addEventListener('popstate', handleUrlChange);
  window.addEventListener('hashchange', handleUrlChange);
}

function getPointerDirection(previousPoint, nextPoint) {
  const dx = nextPoint.x - previousPoint.x;
  const dy = nextPoint.y - previousPoint.y;

  if (dx === 0 && dy === 0) {
    return null;
  }

  return Math.atan2(dy, dx);
}

function didPointerDirectionChange(previousDirection, nextDirection) {
  if (previousDirection === null || nextDirection === null) {
    return false;
  }

  const angleDelta = Math.abs(Math.atan2(
    Math.sin(nextDirection - previousDirection),
    Math.cos(nextDirection - previousDirection),
  ));

  return angleDelta > Math.PI / 4;
}

function applyMouseMovementTriggers() {
  const mouseMovementTriggers = triggerConfig.triggers.filter((trigger) => {
    return trigger.type === 'mouseMovement';
  });

  if (mouseMovementTriggers.length === 0) {
    return;
  }

  let points = [];

  window.addEventListener('mousemove', (event) => {
    const now = Date.now();

    points.push({
      x: event.clientX,
      y: event.clientY,
      time: now,
    });

    const largestWindowMs = Math.max(...mouseMovementTriggers.map((trigger) => {
      return trigger.match?.windowMs ?? 0;
    }));

    points = points.filter((point) => now - point.time <= largestWindowMs);

    const matchingTrigger = mouseMovementTriggers.find((trigger) => {
      const windowMs = trigger.match?.windowMs ?? 0;
      const minimumDistancePx = trigger.match?.minimumDistancePx ?? 0;
      const minimumDirectionChanges = trigger.match?.minimumDirectionChanges ?? 0;
      const windowPoints = points.filter((point) => now - point.time <= windowMs);

      if (windowPoints.length < 2 || !canRunTrigger(trigger)) {
        return false;
      }

      let totalDistance = 0;
      let directionChanges = 0;
      let previousDirection = null;

      for (let idx = 1; idx < windowPoints.length; idx += 1) {
        const previousPoint = windowPoints[idx - 1];
        const nextPoint = windowPoints[idx];
        const dx = nextPoint.x - previousPoint.x;
        const dy = nextPoint.y - previousPoint.y;
        const nextDirection = getPointerDirection(previousPoint, nextPoint);

        totalDistance += Math.hypot(dx, dy);

        if (didPointerDirectionChange(previousDirection, nextDirection)) {
          directionChanges += 1;
        }

        previousDirection = nextDirection ?? previousDirection;
      }

      return totalDistance >= minimumDistancePx
        && directionChanges >= minimumDirectionChanges;
    });

    if (matchingTrigger) {
      console.log('mouseMovementTrigger', matchingTrigger);
      points = [];
      runTrigger(matchingTrigger);
    }
  });
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
