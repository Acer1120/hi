// Variant 3 — Tilt: 2D canvas with vertical squash on the ground plane.
// The ground is drawn under a Y-scale transform to fake the tilted look;
// the player sprite is drawn upright on top, with its base anchored to the
// projected (squashed) ground position.

(() => {
  const D = window.HVData;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const TILT_Y = 0.62;   // ground Y-squash factor (1.0 = flat top-down)

  let bakedMap = null;

  function fitCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  HVEngine.boot({
    onReady(state) {
      bakedMap = D.bakeTilemap(state.assets.tilesheet);
    },
    onFrame(dt, state, running) {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#0b0b10';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!bakedMap || !state.player) return;

      const p = state.player;
      const S = D.RENDER_SCALE;

      // The squashed map is MAP_W*S wide × MAP_H*S*TILT_Y tall on screen.
      const mapW = D.MAP_W * S;
      const mapH = D.MAP_H * S * TILT_Y;

      // Camera in screen space, centered on player's projected position.
      const playerScreenX = p.x * S;
      const playerScreenY = p.y * S * TILT_Y;
      const halfW = canvas.width / 2;
      const halfH = canvas.height / 2;
      const camX = clamp(playerScreenX - halfW, 0, Math.max(0, mapW - canvas.width));
      const camY = clamp(playerScreenY - halfH, 0, Math.max(0, mapH - canvas.height));
      const offX = mapW < canvas.width  ? (canvas.width  - mapW) / 2 : -camX;
      const offY = mapH < canvas.height ? (canvas.height - mapH) / 2 : -camY;

      ctx.save();
      ctx.translate(Math.round(offX), Math.round(offY));

      // Draw squashed ground.
      ctx.save();
      ctx.scale(1, TILT_Y);
      ctx.drawImage(bakedMap, 0, 0, D.MAP_W, D.MAP_H, 0, 0, D.MAP_W * S, D.MAP_H * S);
      ctx.restore();

      // Draw player upright on top, base anchored at projected ground point.
      const frame = HVEngine.currentFrame(p);
      const sheet = state.assets[frame.sheet];
      const drawW = D.SPRITE_DRAW_W * S;
      const drawH = D.SPRITE_DRAW_H * S;
      const baseX = p.x * S;
      const baseY = p.y * S * TILT_Y;
      const dx = baseX - drawW / 2;
      const dy = baseY - drawH * 0.78;

      if (p.facing === -1) {
        ctx.save();
        ctx.translate(dx + drawW, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, frame.idx * D.FRAME_W, 0, D.FRAME_W, D.FRAME_H, 0, 0, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(sheet, frame.idx * D.FRAME_W, 0, D.FRAME_W, D.FRAME_H, dx, dy, drawW, drawH);
      }

      ctx.restore();

      if (!running) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
  });

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
})();
