// Hollow Vigil — Milestone 1
// Single-file game module: input, collision, animation, THREE renderer.

import * as THREE from 'three';

const D = window.HVData;
const U = D.TILE_PX;  // world-px per THREE unit (1 tile = 1 unit)

// ------------------------------------------------------------ input
const keys = Object.create(null);
const KEYMAP = {
  KeyW: 'up',    ArrowUp:    'up',
  KeyS: 'down',  ArrowDown:  'down',
  KeyA: 'left',  ArrowLeft:  'left',
  KeyD: 'right', ArrowRight: 'right',
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { togglePause(); return; }
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) { keys[k] = false; e.preventDefault(); }
});
window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });

function inputVec() {
  let x = 0, y = 0;
  if (keys.left)  x -= 1;
  if (keys.right) x += 1;
  if (keys.up)    y -= 1;
  if (keys.down)  y += 1;
  if (x && y) { const inv = Math.SQRT1_2; x *= inv; y *= inv; }
  return { x, y };
}

// ------------------------------------------------------------ collision
// Axis-separated push-out vs. solid grid. Player is a circle of PLAYER_RADIUS.
function moveWithCollision(p, dx, dy, solid) {
  p.x = sweepAxis(p.x, dx, p.y, solid, true);
  p.y = sweepAxis(p.y, dy, p.x, solid, false);
  if (p.x < D.PLAYER_RADIUS) p.x = D.PLAYER_RADIUS;
  if (p.y < D.PLAYER_RADIUS) p.y = D.PLAYER_RADIUS;
  if (p.x > D.MAP_W - D.PLAYER_RADIUS) p.x = D.MAP_W - D.PLAYER_RADIUS;
  if (p.y > D.MAP_H - D.PLAYER_RADIUS) p.y = D.MAP_H - D.PLAYER_RADIUS;
}
function sweepAxis(primary, delta, other, solid, isX) {
  if (delta === 0) return primary;
  const r = D.PLAYER_RADIUS;
  const next = primary + delta;
  const lead = next + Math.sign(delta) * r;
  const cellLead = Math.floor(lead / D.TILE_PX);
  const otherLo = Math.floor((other - r) / D.TILE_PX);
  const otherHi = Math.floor((other + r) / D.TILE_PX);
  for (let o = otherLo; o <= otherHi; o++) {
    const col = isX ? cellLead : o;
    const row = isX ? o : cellLead;
    if (col < 0 || col >= D.TILES_W || row < 0 || row >= D.TILES_H) continue;
    if (!solid[row * D.TILES_W + col]) continue;
    if (delta > 0) return cellLead * D.TILE_PX - r - 0.001;
    return (cellLead + 1) * D.TILE_PX + r + 0.001;
  }
  return next;
}

// ------------------------------------------------------------ player
const player = {
  x: D.SPAWN_TILE.col * D.TILE_PX + D.TILE_PX / 2,
  y: D.SPAWN_TILE.row * D.TILE_PX + D.TILE_PX / 2,
  vx: 0, vy: 0,
  facing: 1,
  moving: false,
  animTime: 0,
};
const ACCEL = 800;   // world-px/sec^2 — ~0.18s to top speed
const FRICTION = 1200;

function updatePlayer(p, dt, solid) {
  const v = inputVec();
  const targetVx = v.x * D.MOVE_SPEED;
  const targetVy = v.y * D.MOVE_SPEED;
  p.vx = approach(p.vx, targetVx, (v.x !== 0 ? ACCEL : FRICTION) * dt);
  p.vy = approach(p.vy, targetVy, (v.y !== 0 ? ACCEL : FRICTION) * dt);
  const speed = Math.hypot(p.vx, p.vy);
  p.moving = speed > 4;
  if (p.vx > 1) p.facing = 1;
  else if (p.vx < -1) p.facing = -1;
  if (speed > 0.01) {
    moveWithCollision(p, p.vx * dt, p.vy * dt, solid);
  }
  p.animTime += dt;
}
function approach(cur, tgt, step) {
  if (cur < tgt) return Math.min(tgt, cur + step);
  if (cur > tgt) return Math.max(tgt, cur - step);
  return cur;
}

function currentFrame(p) {
  if (p.moving) return { sheet: 'run',  idx: Math.floor(p.animTime * D.RUN_FPS)  % D.RUN_FRAMES };
  return            { sheet: 'idle', idx: Math.floor(p.animTime * D.IDLE_FPS) % D.IDLE_FRAMES };
}

// ------------------------------------------------------------ THREE setup
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x07080d, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07080d, 22, 42);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
const camOffset = new THREE.Vector3(0, 12, 11);
const camTarget = new THREE.Vector3();
const camPos    = new THREE.Vector3();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ------------------------------------------------------------ assets + map
let assets = null;
let solid  = null;
let mapMesh = null;
let playerSprite, spriteCanvas, spriteCtx, spriteTex;
let shadowSprite;

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

function buildScene() {
  // Tilemap plane.
  const baked = D.bakeTilemap(assets.tilesheet);
  const tex = new THREE.CanvasTexture(baked);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const geo = new THREE.PlaneGeometry(D.TILES_W, D.TILES_H);
  mapMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  mapMesh.rotation.x = -Math.PI / 2;
  mapMesh.position.set(D.TILES_W / 2, 0, D.TILES_H / 2);
  scene.add(mapMesh);

  // Player sprite — redrawn per frame from a small canvas.
  spriteCanvas = document.createElement('canvas');
  spriteCanvas.width  = D.FRAME_W;
  spriteCanvas.height = D.FRAME_H;
  spriteCtx = spriteCanvas.getContext('2d');
  spriteCtx.imageSmoothingEnabled = false;
  spriteTex = new THREE.CanvasTexture(spriteCanvas);
  spriteTex.magFilter = THREE.NearestFilter;
  spriteTex.minFilter = THREE.NearestFilter;
  spriteTex.generateMipmaps = false;
  playerSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: spriteTex, transparent: true, fog: false,
  }));
  playerSprite.scale.set(D.SPRITE_DRAW_W / U, D.SPRITE_DRAW_H / U, 1);
  scene.add(playerSprite);

  // Drop shadow.
  shadowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeShadowTexture(), transparent: true, depthWrite: false, fog: false,
  }));
  shadowSprite.scale.set(1.1, 0.55, 1);
  scene.add(shadowSprite);
}

function paintSprite(p) {
  const f = currentFrame(p);
  spriteCtx.clearRect(0, 0, D.FRAME_W, D.FRAME_H);
  if (p.facing === -1) {
    spriteCtx.save();
    spriteCtx.translate(D.FRAME_W, 0);
    spriteCtx.scale(-1, 1);
    spriteCtx.drawImage(assets[f.sheet], f.idx * D.FRAME_W, 0, D.FRAME_W, D.FRAME_H,
                        0, 0, D.FRAME_W, D.FRAME_H);
    spriteCtx.restore();
  } else {
    spriteCtx.drawImage(assets[f.sheet], f.idx * D.FRAME_W, 0, D.FRAME_W, D.FRAME_H,
                        0, 0, D.FRAME_W, D.FRAME_H);
  }
  spriteTex.needsUpdate = true;
}

// ------------------------------------------------------------ pause + title
const titleEl  = document.getElementById('title');
const pauseEl  = document.getElementById('pause');
const playBtn  = document.getElementById('play');
const resumeBtn = document.getElementById('resume');
const fpsEl    = document.getElementById('fps');

let started = false;
let paused  = false;

playBtn.addEventListener('click', () => {
  if (!assets) return;
  titleEl.classList.add('hidden');
  started = true;
});
resumeBtn.addEventListener('click', () => { paused = false; pauseEl.classList.add('hidden'); });

function togglePause() {
  if (!started) return;
  paused = !paused;
  pauseEl.classList.toggle('hidden', !paused);
}

// ------------------------------------------------------------ main loop
let last = performance.now();
let fpsAccum = 0, fpsFrames = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (started && !paused && solid) {
    updatePlayer(player, dt, solid);
  }

  if (assets) {
    paintSprite(player);

    const tx = player.x / U;
    const tz = player.y / U;

    // Stride bob: gentle up-and-down while running.
    const bob = player.moving ? Math.sin(player.animTime * D.RUN_FPS * Math.PI) * 0.06 : 0;
    const baseY = D.SPRITE_DRAW_H / U * 0.5;
    playerSprite.position.set(tx, baseY + bob, tz);

    // Shadow stays flat on the ground, slightly forward of feet.
    shadowSprite.position.set(tx, 0.02, tz + 0.45);

    // Camera follows with smoothing. Snap on first frame after start.
    camTarget.set(tx + camOffset.x, camOffset.y, tz + camOffset.z);
    if (!camPos.lengthSq()) camPos.copy(camTarget);
    else camPos.lerp(camTarget, started ? 1 - Math.pow(0.001, dt) : 1);
    camera.position.copy(camPos);
    camera.lookAt(tx, 0.5, tz - 1);

    renderer.render(scene, camera);
  }

  // FPS counter (1 Hz).
  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 1) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsAccum)} fps`;
    fpsAccum = 0; fpsFrames = 0;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------ boot
D.loadAssets().then((a) => {
  assets = a;
  solid = D.buildSolidGrid();
  buildScene();
  playBtn.disabled = false;
  playBtn.textContent = 'NEW GAME';
}).catch((err) => {
  console.error(err);
  playBtn.textContent = 'load failed';
});
