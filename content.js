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
  applyScrollTriggers();
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
  if (runner?.currentResult?.metadata?.interruptible === 'false') {
    return false;
  }

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
  if (!chrome.runtime?.id) return;

  video.loop = loop;
  video.src = chrome.runtime.getURL(src);
  video.currentTime = 0;
  video.play().catch(console.error);

  if (returnToIdle && !loop) {
    video.onended = () => {
      if (!chrome.runtime?.id) return;
      video.onended = null;
      video.loop = true;
      video.src = chrome.runtime.getURL(IDLE_VIDEO_PATH);
      video.play().catch(console.error);
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

function applyScrollTriggers() {
  const scrollTriggers = triggerConfig.triggers.filter((trigger) => {
    return trigger.type === 'scroll';
  });

  if (scrollTriggers.length === 0) {
    return;
  }

  let points = [];

  window.addEventListener('scroll', () => {
    const now = Date.now();

    points.push({
      y: window.scrollY,
      time: now,
    });

    const largestWindowMs = Math.max(...scrollTriggers.map((trigger) => {
      return trigger.match?.windowMs ?? 0;
    }));

    points = points.filter((point) => now - point.time <= largestWindowMs);

    const matchingTrigger = scrollTriggers.find((trigger) => {
      const windowMs = trigger.match?.windowMs ?? 0;
      const minimumDistancePx = trigger.match?.minimumDistancePx ?? 0;
      const minimumVelocityPxPerSecond = trigger.match?.minimumVelocityPxPerSecond ?? 0;
      const windowPoints = points.filter((point) => now - point.time <= windowMs);

      if (windowPoints.length < 2 || !canRunTrigger(trigger)) {
        return false;
      }

      let totalDistance = 0;
      for (let idx = 1; idx < windowPoints.length; idx += 1) {
        totalDistance += Math.abs(windowPoints[idx].y - windowPoints[idx - 1].y);
      }

      const durationMs = windowPoints[windowPoints.length - 1].time - windowPoints[0].time;
      if (durationMs === 0) return false;

      const velocityPxPerSecond = (totalDistance / durationMs) * 1000;

      return totalDistance >= minimumDistancePx
        && velocityPxPerSecond >= minimumVelocityPxPerSecond;
    });

    if (matchingTrigger) {
      console.log('scrollTrigger', matchingTrigger);
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

  if (name === 'EnlargeKeywords') {
    const keywordsStr = args.keywords || args.positional[0] || "";
    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    if (keywords.length > 0) {
      enlargeKeywordsOnPage(keywords);
    }
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag]));
}

function enlargeKeywordsOnPage(keywords) {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  const nodesToModify = [];

  // Escape regex special characters in keywords and join them
  const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');

  while(node = walk.nextNode()) {
    if (node.parentNode && 
        node.parentNode.nodeName !== 'SCRIPT' && 
        node.parentNode.nodeName !== 'STYLE' &&
        node.parentNode.nodeName !== 'NOSCRIPT' &&
        !node.parentNode.classList.contains('costar-enlarged-keyword')) {
      if (pattern.test(node.nodeValue)) {
        nodesToModify.push(node);
      }
    }
  }

  nodesToModify.forEach(textNode => {
    const span = document.createElement('span');
    const escapedText = escapeHTML(textNode.nodeValue);
    
    // We need to apply the pattern to the escaped text, but be careful if a keyword matches an HTML entity.
    // For simplicity, we just run the replacement.
    span.innerHTML = escapedText.replace(pattern, '<span class="costar-enlarged-keyword">$&</span>');
    textNode.parentNode.replaceChild(span, textNode);
  });
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

// ── drag handle ──
const dragHandle = document.createElement('div');
dragHandle.className = 'drag-handle';
buddyContainer.appendChild(dragHandle);

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

// ── dragging logic ──
(function initDrag() {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;

    const rect = buddyContainer.getBoundingClientRect();

    // Switch from bottom/right to top/left positioning on first drag
    buddyContainer.style.bottom = 'auto';
    buddyContainer.style.right = 'auto';
    buddyContainer.style.left = rect.left + 'px';
    buddyContainer.style.top = rect.top + 'px';

    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    // Clamp to viewport
    const maxLeft = window.innerWidth - buddyContainer.offsetWidth;
    const maxTop = window.innerHeight - buddyContainer.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    buddyContainer.style.left = newLeft + 'px';
    buddyContainer.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
})();
