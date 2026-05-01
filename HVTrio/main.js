// HVTrio — orchestrator. Boots the engine, swaps active renderer on demand.

const D = window.HVData;
const eng = window.HVEngine;

const stage = document.getElementById('stage');
const titleEl = document.getElementById('title');
const playBtn = document.getElementById('play');
const pauseEl = document.getElementById('pause');
const resumeBtn = document.getElementById('resume');
const fpsEl = document.getElementById('fps');
const modeBtns = document.querySelectorAll('#modes button');
const zoneFadeEl = document.getElementById('zoneFade');

let started = false;
let activeMode = null;
let active = null;   // { draw, unmount }

const LOADERS = {
  flat:  () => import('./render-flat.js'),
  three: () => import('./render-three.js'),
  tilt:  () => import('./render-tilt.js'),
};

async function switchTo(mode) {
  if (mode === activeMode) return;
  if (active) { active.unmount(); active = null; }
  const mod = await LOADERS[mode]();
  active = mod.mount(stage);
  activeMode = mode;
  for (const b of modeBtns) b.classList.toggle('on', b.dataset.mode === mode);
}

eng.onEscape = () => {
  if (!started) return;
  eng.paused = !eng.paused;
  pauseEl.classList.toggle('hidden', !eng.paused);
};

playBtn.addEventListener('click', () => {
  if (!eng.ready) return;
  titleEl.classList.add('hidden');
  started = true;
});
resumeBtn.addEventListener('click', () => {
  eng.paused = false;
  pauseEl.classList.add('hidden');
});
for (const b of modeBtns) {
  b.addEventListener('click', () => switchTo(b.dataset.mode));
}

let last = performance.now();
let fpsAccum = 0, fpsFrames = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (started) eng.tick(dt);
  if (active) active.draw(dt);

  // Toggle the legacy zoneFade scroll. CSS owns the easing/animation —
  // engine just flips the boolean; CSS opens/closes the scroll smoothly.
  const wantOn = eng.travelScrollOn();
  zoneFadeEl.classList.toggle('on', wantOn);

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsAccum)} fps · ${activeMode ?? '—'}`;
    fpsAccum = 0; fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

eng.load().then(async () => {
  playBtn.disabled = false;
  playBtn.textContent = 'NEW GAME';
  // Default renderer on boot.
  await switchTo('three');
  requestAnimationFrame(frame);
}).catch((err) => {
  console.error(err);
  playBtn.textContent = 'load failed';
});
