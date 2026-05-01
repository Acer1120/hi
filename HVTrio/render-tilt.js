// TILT renderer — 2D canvas with vertical squash on the ground plane.

const D = window.HVData;
const TILT_Y = 0.62;

export function mount(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'render-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let bakedMap = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.floor(window.innerWidth  * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width  = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  resize();
  window.addEventListener('resize', resize);

  function ensureBaked() {
    if (!bakedMap && window.HVEngine.ready) {
      bakedMap = D.bakeTilemap(window.HVEngine.assets.tilesheet);
    }
  }

  function draw(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, W, H);
    const eng = window.HVEngine;
    if (!eng.ready) return;
    ensureBaked();
    const p = eng.player;
    const S = D.RENDER_SCALE;

    const mapW = D.MAP_W * S;
    const mapH = D.MAP_H * S * TILT_Y;
    const playerScreenX = p.x * S;
    const playerScreenY = p.y * S * TILT_Y;
    const halfW = W / 2;
    const halfH = H / 2;
    const camX = clamp(playerScreenX - halfW, 0, Math.max(0, mapW - W));
    const camY = clamp(playerScreenY - halfH, 0, Math.max(0, mapH - H));
    const offX = mapW < W ? (W - mapW) / 2 : -camX;
    const offY = mapH < H ? (H - mapH) / 2 : -camY;

    ctx.save();
    ctx.translate(Math.round(offX), Math.round(offY));

    ctx.save();
    ctx.scale(1, TILT_Y);
    ctx.drawImage(bakedMap, 0, 0, D.MAP_W, D.MAP_H, 0, 0, D.MAP_W * S, D.MAP_H * S);
    ctx.restore();

    // Shadow at projected ground point — scaled with sprite.
    const baseX = p.x * S;
    const baseY = p.y * S * TILT_Y;
    const shadowRX = D.SPRITE_DRAW_W * S * 0.10;
    const shadowRY = D.SPRITE_DRAW_H * S * 0.035;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    // Shadow locked directly under the player's projected position.
    ctx.ellipse(baseX, baseY, shadowRX, shadowRY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Player upright above shadow.
    const drawW = D.SPRITE_DRAW_W * S;
    const drawH = D.SPRITE_DRAW_H * S;
    const dx = baseX - drawW / 2;
    const dy = baseY - drawH * D.SPRITE_FOOT_FRAC;
    eng.paintPlayerFrame(ctx, eng.assets, p, dx, dy, drawW, drawH);

    ctx.restore();
  }

  function unmount() {
    window.removeEventListener('resize', resize);
    canvas.remove();
  }

  return { draw, unmount };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
