// Variant 1 — Flat: pure 2D top-down canvas.

(() => {
  const D = window.HVData;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

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

      // Camera: center the player. Clamp at map edges so we don't pan into void.
      const halfW = canvas.width / 2;
      const halfH = canvas.height / 2;
      const camPxX = clamp(p.x * S - halfW, 0, D.MAP_W * S - canvas.width);
      const camPxY = clamp(p.y * S - halfH, 0, D.MAP_H * S - canvas.height);
      // If the map is smaller than the viewport along an axis, center it.
      const offX = D.MAP_W * S < canvas.width  ? (canvas.width  - D.MAP_W * S) / 2 : -camPxX;
      const offY = D.MAP_H * S < canvas.height ? (canvas.height - D.MAP_H * S) / 2 : -camPxY;

      ctx.save();
      ctx.translate(Math.round(offX), Math.round(offY));
      ctx.drawImage(bakedMap, 0, 0, D.MAP_W, D.MAP_H, 0, 0, D.MAP_W * S, D.MAP_H * S);

      // Player sprite. Frame is mostly transparent margin; we draw the whole
      // 192x128 frame at SPRITE_DRAW_W x SPRITE_DRAW_H (world-px), centered on
      // the player's position, with feet aligned to ground.
      const frame = HVEngine.currentFrame(p);
      const sheet = state.assets[frame.sheet];
      const sxFrame = frame.idx * D.FRAME_W;
      const drawW = D.SPRITE_DRAW_W * S;
      const drawH = D.SPRITE_DRAW_H * S;
      const cx = p.x * S;
      const cy = p.y * S;
      const dx = cx - drawW / 2;
      const dy = cy - drawH * 0.78;  // feet-anchor: most of frame is above feet

      if (p.facing === -1) {
        ctx.save();
        ctx.translate(dx + drawW, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, sxFrame, 0, D.FRAME_W, D.FRAME_H, 0, 0, drawW, drawH);
        ctx.restore();
      } else {
        ctx.drawImage(sheet, sxFrame, 0, D.FRAME_W, D.FRAME_H, dx, dy, drawW, drawH);
      }

      ctx.restore();

      if (!running) {
        // Subtle vignette so the title overlay reads better.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
  });

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
})();
