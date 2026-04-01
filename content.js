// import * as THREE from "./three.module.js"
console.log('content.js: injected into the page');

const script = document.createElement('script');
script.src = './three.min.js';
script.src = chrome.runtime.getURL('three.min.js');
document.head.appendChild(script);


// document.body.innerHTML +=  'Hello at the end of the page!!'
script.onload = () => {
  console.log('content.js: loaded threejs');

  // const scene = new THREE.Scene();
  // etc.
};

// import * as THREE from 'three';
