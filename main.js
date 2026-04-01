window.addEventListener('load', () => {
  console.log("main.js: page loaded")
  // const scene = new THREE.Scene();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera( 75, 1, 0.1, 1000 );

  const renderer = new THREE.WebGLRenderer();
  renderer.setSize( 300, 300 );
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position: fixed; top: 0; right: 0;'

  const geometry = new THREE.BoxGeometry( 1, 1, 1 );
  const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
  const cube = new THREE.Mesh( geometry, material );
  scene.add( cube );

  camera.position.z = 5;

  function animate( time ) {
    cube.rotation.x = time / 2000;
    cube.rotation.y = time / 1000;


    renderer.render(scene, camera);

  }
  renderer.setAnimationLoop( animate );

});
