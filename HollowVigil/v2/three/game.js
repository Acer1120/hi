// Variant 2 — Three: THREE.js pseudo-3D with a tilted perspective camera.
import * as THREE from 'three';

const D = window.HVData;

// Coordinate convention: 1 THREE unit = 1 tile (16 world-px). 2D-Y maps to 3D-Z.
const U = D.TILE_PX;  // world-px per THREE unit

// Renderer + scene
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05060a, 1);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';
renderer.domElement.style.imageRendering = 'pixelated';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

// Tilemap plane — created after assets load.
let mapMesh = null;
let playerSprite = null;
let spriteCanvas = null;
let spriteCtx = null;
let spriteTex = null;

function buildMap(state) {
  const baked = D.bakeTilemap(state.assets.tilesheet);
  const tex = new THREE.CanvasTexture(baked);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  // Flip vertically so row 0 is at far (north) end of the plane.
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const geo = new THREE.PlaneGeometry(D.TILES_W, D.TILES_H);
  mapMesh = new THREE.Mesh(geo, mat);
  // Lay flat on XZ plane, centered. Rotate -90 around X so +Y of plane → -Z.
  mapMesh.rotation.x = -Math.PI / 2;
  // Center at (TILES_W/2, 0, TILES_H/2) so cell (col=0,row=0) is at (0.5, 0, 0.5).
  mapMesh.position.set(D.TILES_W / 2, 0, D.TILES_H / 2);
  scene.add(mapMesh);

  // Player sprite: redraw to a tiny canvas each frame and mark texture dirty.
  spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = D.FRAME_W;
  spriteCanvas.height = D.FRAME_H;
  spriteCtx = spriteCanvas.getContext('2d');
  spriteCtx.imageSmoothingEnabled = false;

  spriteTex = new THREE.CanvasTexture(spriteCanvas);
  spriteTex.magFilter = THREE.NearestFilter;
  spriteTex.minFilter = THREE.NearestFilter;
  spriteTex.generateMipmaps = false;

  const spriteMat = new THREE.SpriteMaterial({ map: spriteTex, transparent: true });
  playerSprite = new THREE.Sprite(spriteMat);
  // Scale to SPRITE_DRAW_W × SPRITE_DRAW_H (in tile units).
  playerSprite.scale.set(D.SPRITE_DRAW_W / U, D.SPRITE_DRAW_H / U, 1);
  scene.add(playerSprite);
}

function paintSprite(state) {
  const p = state.player;
  const frame = HVEngine.currentFrame(p);
  const sheet = state.assets[frame.sheet];
  spriteCtx.clearRect(0, 0, D.FRAME_W, D.FRAME_H);
  if (p.facing === -1) {
    spriteCtx.save();
    spriteCtx.translate(D.FRAME_W, 0);
    spriteCtx.scale(-1, 1);
    spriteCtx.drawImage(sheet, frame.idx * D.FRAME_W, 0, D.FRAME_W, D.FRAME_H,
                        0, 0, D.FRAME_W, D.FRAME_H);
    spriteCtx.restore();
  } else {
    spriteCtx.drawImage(sheet, frame.idx * D.FRAME_W, 0, D.FRAME_W, D.FRAME_H,
                        0, 0, D.FRAME_W, D.FRAME_H);
  }
  spriteTex.needsUpdate = true;
}

function placePlayer(state) {
  const p = state.player;
  // World-px → THREE units: x is x/U, y(2D south) is z/U on the plane.
  const tx = p.x / U;
  const tz = p.y / U;
  // Lift sprite so it appears standing on the ground (half height up).
  playerSprite.position.set(tx, D.SPRITE_DRAW_H / U * 0.5, tz);
}

function placeCamera(state) {
  const p = state.player;
  const tx = p.x / U;
  const tz = p.y / U;
  // Tilted camera: above and slightly behind (south of) the player.
  camera.position.set(tx, 13, tz + 9);
  camera.lookAt(tx, 0.5, tz - 1);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

HVEngine.boot({
  onReady(state) {
    buildMap(state);
    placePlayer(state);
    placeCamera(state);
  },
  onFrame(dt, state, running) {
    if (!playerSprite) return;
    paintSprite(state);
    placePlayer(state);
    placeCamera(state);
    renderer.render(scene, camera);
  },
});
