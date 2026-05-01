// FLAT renderer — pure 2D top-down canvas.

const D = window.HVData;

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
    // Layout in CSS pixels (the dpr scale was already applied to the ctx).
    const W = window.innerWidth, H = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, W, H);
    const eng = window.HVEngine;
    if (!eng.ready) return;
    ensureBaked();
    const p = eng.player;
    const S = D.RENDER_SCALE;
    const halfW = W / 2;
    const halfH = H / 2;
    const camX = clamp(p.x * S - halfW, 0, Math.max(0, D.MAP_W * S - W));
    const camY = clamp(p.y * S - halfH, 0, Math.max(0, D.MAP_H * S - H));
    const offX = D.MAP_W * S < W ? (W - D.MAP_W * S) / 2 : -camX;
    const offY = D.MAP_H * S < H ? (H - D.MAP_H * S) / 2 : -camY;

    ctx.save();
    ctx.translate(Math.round(offX), Math.round(offY));
    ctx.drawImage(bakedMap, 0, 0, D.MAP_W, D.MAP_H, 0, 0, D.MAP_W * S, D.MAP_H * S);

    // Drop shadow under player feet — scaled with sprite.
    const sx = p.x * S, sy = p.y * S;
    const shadowRX = D.SPRITE_DRAW_W * S * 0.10;
    const shadowRY = D.SPRITE_DRAW_H * S * 0.04;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    // Shadow locked directly under the player's logical position (= feet).
    ctx.ellipse(sx, sy, shadowRX, shadowRY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Player.
    const drawW = D.SPRITE_DRAW_W * S;
    const drawH = D.SPRITE_DRAW_H * S;
    const dx = sx - drawW / 2;
    const dy = sy - drawH * D.SPRITE_FOOT_FRAC;
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
