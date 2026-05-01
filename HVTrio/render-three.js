// THREE renderer — pseudo-3D with tilted perspective camera.

import * as THREE from 'three';

const D = window.HVData;
const U = D.TILE_PX;

export function mount(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x07080d, 1);
  renderer.domElement.className = 'render-canvas';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07080d, 22, 42);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
  const camOffset = new THREE.Vector3(0, 12, 11);
  const camPos = new THREE.Vector3();

  const eng = window.HVEngine;

  // Single tilemap plane. Player sprite drawn over it = always topmost.
  const baked = D.bakeTilemap(eng.assets.tilesheet);
  const tex = new THREE.CanvasTexture(baked);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const mapMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(D.TILES_W, D.TILES_H),
    new THREE.MeshBasicMaterial({ map: tex, fog: true })
  );
  mapMesh.rotation.x = -Math.PI / 2;
  mapMesh.position.set(D.TILES_W / 2, 0, D.TILES_H / 2);
  scene.add(mapMesh);

  // Player sprite (canvas-backed, redrawn per frame via shared paintPlayerFrame).
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = D.FRAME_W;
  spriteCanvas.height = D.FRAME_H;
  const spriteCtx = spriteCanvas.getContext('2d');
  spriteCtx.imageSmoothingEnabled = false;
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);
  spriteTex.magFilter = THREE.NearestFilter;
  spriteTex.minFilter = THREE.NearestFilter;
  spriteTex.generateMipmaps = false;
  const playerSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: spriteTex, transparent: true, fog: false,
  }));
  playerSprite.scale.set(D.SPRITE_DRAW_W / U, D.SPRITE_DRAW_H / U, 1);
  scene.add(playerSprite);

  // Drop shadow.
  const shadowTex = makeShadowTexture();
  const shadowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: shadowTex, transparent: true, depthWrite: false, fog: false,
  }));
  // Shadow sized to ~22% of sprite width, very flat.
  const shW = (D.SPRITE_DRAW_W / U) * 0.22;
  shadowSprite.scale.set(shW, shW * 0.42, 1);
  scene.add(shadowSprite);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  let firstFrame = true;

  function draw(dt) {
    const p = eng.player;
    if (!p) return;

    // Repaint sprite frame.
    spriteCtx.clearRect(0, 0, D.FRAME_W, D.FRAME_H);
    eng.paintPlayerFrame(spriteCtx, eng.assets, p, 0, 0, D.FRAME_W, D.FRAME_H);
    spriteTex.needsUpdate = true;

    const tx = p.x / U;
    const tz = p.y / U;
    const bob = p.moving ? Math.sin(p.animTime * D.RUN_FPS * Math.PI) * 0.06 : 0;
    // Sprite center sits at scale*(0.5 - foot_from_bottom), where
    // foot_from_bottom = 1 - SPRITE_FOOT_FRAC. This puts the feet on the ground.
    const spriteH = D.SPRITE_DRAW_H / U;
    const centerY = spriteH * (D.SPRITE_FOOT_FRAC - 0.5) + bob;
    playerSprite.position.set(tx, centerY, tz);
    // Shadow locked at the player's ground position (no Y offset).
    shadowSprite.position.set(tx, 0.02, tz);

    const target = new THREE.Vector3(tx + camOffset.x, camOffset.y, tz + camOffset.z);
    if (firstFrame) { camPos.copy(target); firstFrame = false; }
    else camPos.lerp(target, 1 - Math.pow(0.001, dt));
    camera.position.copy(camPos);
    camera.lookAt(tx, 0.5, tz - 1);

    renderer.render(scene, camera);
  }

  function unmount() {
    window.removeEventListener('resize', resize);
    renderer.dispose();
    tex.dispose();
    spriteTex.dispose();
    shadowTex.dispose();
    mapMesh.geometry.dispose();
    mapMesh.material.dispose();
    playerSprite.material.dispose();
    shadowSprite.material.dispose();
    renderer.domElement.remove();
  }

  return { draw, unmount };
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
