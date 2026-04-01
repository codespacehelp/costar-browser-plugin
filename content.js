console.log('content.js: injected into the page');


// document.body.innerHTML +=  'Hello at the end of the page!!'

const video = document.createElement('video');
video.src = chrome.runtime.getURL('videos/default.webm');
video.autoplay = true;
video.loop = true;
video.muted = true;
video.style.cssText = 'position: fixed; top: 0; right: 0; width: 480px; height: 270px; object-fit: contain; z-index: 999; pointer-events: none; ';
document.body.appendChild(video);

console.log(video);
