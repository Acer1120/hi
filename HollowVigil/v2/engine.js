// HollowVigil v2 — shared engine layer.
// Renderer-agnostic: input, player state, animation, collision.
// Variants supply only an init() and a draw().

(() => {
  const D = window.HVData;

  // ---- Input ----------------------------------------------------------------
  const keys = Object.create(null);
  const KEYMAP = {
    KeyW: 'up',    ArrowUp:    'up',
    KeyS: 'down',  ArrowDown:  'down',
    KeyA: 'left',  ArrowLeft:  'left',
    KeyD: 'right', ArrowRight: 'right',
  };
  function attachInput() {
    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (k) { keys[k] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) { keys[k] = false; e.preventDefault(); }
    });
    // Drop all keys if window loses focus — avoids stuck-key drift.
    window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
  }
  function inputVec() {
    let x = 0, y = 0;
    if (keys.left)  x -= 1;
    if (keys.right) x += 1;
    if (keys.up)    y -= 1;
    if (keys.down)  y += 1;
    if (x && y) { const inv = Math.SQRT1_2; x *= inv; y *= inv; }
    return { x, y };
  }

  // ---- Player ---------------------------------------------------------------
  function createPlayer() {
    return {
      x: D.SPAWN_TILE.col * D.TILE_PX + D.TILE_PX / 2,
      y: D.SPAWN_TILE.row * D.TILE_PX + D.TILE_PX / 2,
      facing: 1,             // 1 = right, -1 = left
      moving: false,
      animTime: 0,
    };
  }

  // ---- Collision ------------------------------------------------------------
  // Axis-separated AABB push-out against a precomputed solid grid.
  // Player is treated as a circle (PLAYER_RADIUS); each solid cell is a 16x16
  // AABB. We resolve X then Y so the player slides along walls cleanly.
  function moveWithCollision(p, dx, dy, solid) {
    p.x = clampAxis(p.x, dx, p.y, solid, true);
    p.y = clampAxis(p.y, dy, p.x, solid, false);
    if (p.x < D.PLAYER_RADIUS) p.x = D.PLAYER_RADIUS;
    if (p.y < D.PLAYER_RADIUS) p.y = D.PLAYER_RADIUS;
    if (p.x > D.MAP_W - D.PLAYER_RADIUS) p.x = D.MAP_W - D.PLAYER_RADIUS;
    if (p.y > D.MAP_H - D.PLAYER_RADIUS) p.y = D.MAP_H - D.PLAYER_RADIUS;
  }
  function clampAxis(primary, delta, other, solid, isX) {
    const next = primary + delta;
    if (delta === 0) return primary;
    const r = D.PLAYER_RADIUS;
    // Determine the cells the player's circle overlaps in the moved-axis range.
    const lead = next + Math.sign(delta) * r;
    const cellLead = Math.floor(lead / D.TILE_PX);
    const otherLo = Math.floor((other - r) / D.TILE_PX);
    const otherHi = Math.floor((other + r) / D.TILE_PX);
    for (let o = otherLo; o <= otherHi; o++) {
      const col = isX ? cellLead : o;
      const row = isX ? o : cellLead;
      if (col < 0 || col >= D.TILES_W || row < 0 || row >= D.TILES_H) continue;
      if (!solid[row * D.TILES_W + col]) continue;
      // Snap the player flush against this cell's near edge.
      if (delta > 0) return cellLead * D.TILE_PX - r - 0.001;
      return (cellLead + 1) * D.TILE_PX + r + 0.001;
    }
    return next;
  }

  // ---- Update tick ----------------------------------------------------------
  function updatePlayer(p, dt, solid) {
    const v = inputVec();
    p.moving = (v.x !== 0 || v.y !== 0);
    if (v.x !== 0) p.facing = v.x > 0 ? 1 : -1;
    if (p.moving) {
      moveWithCollision(p, v.x * D.MOVE_SPEED * dt, v.y * D.MOVE_SPEED * dt, solid);
      p.animTime += dt;
    } else {
      p.animTime += dt;   // idle still cycles
    }
  }

  // ---- Animation ------------------------------------------------------------
  function currentFrame(p) {
    if (p.moving) {
      const idx = Math.floor(p.animTime * D.RUN_FPS) % D.RUN_FRAMES;
      return { sheet: 'run', idx };
    }
    const idx = Math.floor(p.animTime * D.IDLE_FPS) % D.IDLE_FRAMES;
    return { sheet: 'idle', idx };
  }

  // ---- Title screen + game loop runner -------------------------------------
  // Variants supply { onReady(assets, solid), onFrame(dt, assets, player, solid) }.
  // We handle: asset load, title overlay, key plumbing, RAF.
  function boot({ onReady, onFrame }) {
    attachInput();
    const titleEl = document.getElementById('title');
    const playBtn = document.getElementById('play');
    let running = false;

    const state = {
      assets: null,
      player: null,
      solid: null,
    };

    D.loadAssets().then((assets) => {
      state.assets = assets;
      state.solid = D.buildSolidGrid();
      state.player = createPlayer();
      onReady?.(state);
      // Show "ready" cue on the play button.
      if (playBtn) playBtn.disabled = false;
    }).catch((err) => {
      console.error('Asset load failed', err);
      const sub = document.getElementById('subtitle');
      if (sub) sub.textContent = 'asset load failed — check console';
    });

    if (playBtn) {
      playBtn.disabled = true;
      playBtn.addEventListener('click', () => {
        if (!state.assets) return;
        titleEl.classList.add('hidden');
        running = true;
      });
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (running && state.player) {
        updatePlayer(state.player, dt, state.solid);
      }
      onFrame?.(dt, state, running);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return state;
  }

  window.HVEngine = { boot, currentFrame, createPlayer, updatePlayer };
})();
