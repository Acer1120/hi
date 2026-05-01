// HVTrio — shared engine. Player + controls + collision + animation, copied
// verbatim from HollowVigilV3 so all three renderers feel identical.

const D = window.HVData;

// ---- Input ----------------------------------------------------------------
const keys = Object.create(null);
const KEYMAP = {
  KeyW: 'up',    ArrowUp:    'up',
  KeyS: 'down',  ArrowDown:  'down',
  KeyA: 'left',  ArrowLeft:  'left',
  KeyD: 'right', ArrowRight: 'right',
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { engine.onEscape?.(); return; }
  // Lock all gameplay input while a travel sequence is playing.
  if (engine.traveling) { e.preventDefault(); return; }
  if (e.code === 'Space' || e.code === 'KeyJ') { engine._wantAttack = true; e.preventDefault(); return; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') {
    engine._wantDash = true; e.preventDefault(); return;
  }
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

// ---- Collision ------------------------------------------------------------
// Cells are an array of per-cell axis-aligned rectangles in WORLD pixels
// (or null for walkable). Each rect is a tight pixel-perfect bound around
// the actual sprite art at that cell — not the full 16x16 cell — so trees
// and rocks only block where their pixels actually are.
function moveWithCollision(p, dx, dy, cells) {
  p.x = sweepAxis(p.x, dx, p.y, cells, true);
  p.y = sweepAxis(p.y, dy, p.x, cells, false);
  if (p.x < D.PLAYER_RADIUS) p.x = D.PLAYER_RADIUS;
  if (p.y < D.PLAYER_RADIUS) p.y = D.PLAYER_RADIUS;
  if (p.x > D.MAP_W - D.PLAYER_RADIUS) p.x = D.MAP_W - D.PLAYER_RADIUS;
  if (p.y > D.MAP_H - D.PLAYER_RADIUS) p.y = D.MAP_H - D.PLAYER_RADIUS;
}
function sweepAxis(primary, delta, other, cells, isX) {
  if (delta === 0) return primary;
  const r = D.PLAYER_RADIUS;
  const next = primary + delta;
  const lead = next + Math.sign(delta) * r;
  const leadCell = Math.floor(lead / D.TILE_PX);
  // Scan a few extra cells in the other axis since pixel-bound boxes may
  // straddle cell boundaries.
  const otherLo = Math.floor((other - r) / D.TILE_PX) - 1;
  const otherHi = Math.floor((other + r) / D.TILE_PX) + 1;
  let bestSnap = next;
  let collided = false;
  for (let o = otherLo; o <= otherHi; o++) {
    const col = isX ? leadCell : o;
    const row = isX ? o : leadCell;
    if (col < 0 || col >= D.TILES_W || row < 0 || row >= D.TILES_H) continue;
    const b = cells[row * D.TILES_W + col];
    if (!b) continue;
    // Other-axis overlap test against the tile's tight bounds.
    const otherLoPx = isX ? b.y0 : b.x0;
    const otherHiPx = isX ? b.y1 : b.x1;
    if (other + r <= otherLoPx || other - r >= otherHiPx) continue;
    // Primary-axis overlap test (does the player's circle reach this rect?)
    const priLo = isX ? b.x0 : b.y0;
    const priHi = isX ? b.x1 : b.y1;
    if (next + r <= priLo || next - r >= priHi) continue;
    // Snap player to the rect's near edge.
    const snap = delta > 0 ? priLo - r - 0.001 : priHi + r + 0.001;
    if (!collided
        || (delta > 0 && snap < bestSnap)
        || (delta < 0 && snap > bestSnap)) {
      bestSnap = snap;
      collided = true;
    }
  }
  return collided ? bestSnap : next;
}

// ---- Player + animation ---------------------------------------------------
function createPlayer() {
  return {
    x: D.SPAWN_TILE.col * D.TILE_PX + D.TILE_PX / 2,
    y: D.SPAWN_TILE.row * D.TILE_PX + D.TILE_PX / 2,
    vx: 0, vy: 0,
    facing: 1,
    moving: false,
    animTime: 0,
    // Action state.
    attackTime: 0,        // counts down while attacking
    dashTime: 0,          // counts down while dashing
    dashCooldown: 0,      // counts down after a dash
    dashDirX: 0, dashDirY: 0,
  };
}

const ACCEL = 800;     // world-px/sec^2 (~0.18s to top speed)
const FRICTION = 1200;

function approach(cur, tgt, step) {
  if (cur < tgt) return Math.min(tgt, cur + step);
  if (cur > tgt) return Math.max(tgt, cur - step);
  return cur;
}

function updatePlayer(p, dt, solid) {
  // Tick down action timers.
  if (p.attackTime > 0)   p.attackTime   = Math.max(0, p.attackTime - dt);
  if (p.dashTime > 0)     p.dashTime     = Math.max(0, p.dashTime - dt);
  if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);

  // World-border crossings trigger travel. East/west are now physical fences
  // (see buildSolidGrid) so only N/S can be crossed; the rest is here as a
  // belt-and-suspenders fallback.
  const crossedN = p.y - D.PLAYER_RADIUS < D.NORTH_BORDER_Y;
  const crossedS = p.y > D.SOUTH_BORDER_Y;
  if (!engine.traveling && (crossedN || crossedS)) {
    engine.traveling = true;
    engine.travelTime = 0;
    // ~2.0s total: 0.6s scroll unrolls, 0.8s hold (respawn happens here),
    // 0.6s scroll re-rolls / world fades back. CSS does the visual easing.
    engine.travelTotal = 2.0;
    p.vx = 0; p.vy = 0;
    p.attackTime = 0; p.dashTime = 0;
    engine._wantAttack = false;
    engine._wantDash = false;
    for (const k of Object.keys(keys)) keys[k] = false;
    return;
  }

  // Trigger queued actions.
  if (engine._wantDash && p.dashTime === 0 && p.dashCooldown === 0) {
    const v = inputVec();
    let dx = v.x, dy = v.y;
    if (dx === 0 && dy === 0) { dx = p.facing; dy = 0; }   // dash forward if no input
    p.dashTime = D.DASH_DURATION;
    p.dashCooldown = D.DASH_COOLDOWN;
    p.dashDirX = dx; p.dashDirY = dy;
    p.attackTime = 0;   // dash cancels attack
  }
  engine._wantDash = false;

  if (engine._wantAttack && p.attackTime === 0 && p.dashTime === 0) {
    p.attackTime = D.ATTACK_FRAMES / D.ATTACK_FPS;
  }
  engine._wantAttack = false;

  if (p.dashTime > 0) {
    // Dashing: lock velocity to dash vector, ignore input.
    p.vx = p.dashDirX * D.DASH_SPEED;
    p.vy = p.dashDirY * D.DASH_SPEED;
    if (p.vx > 1) p.facing = 1;
    else if (p.vx < -1) p.facing = -1;
    moveWithCollision(p, p.vx * dt, p.vy * dt, solid);
    p.moving = true;
  } else if (p.attackTime > 0) {
    // Attacking: stop moving.
    p.vx = approach(p.vx, 0, FRICTION * 2 * dt);
    p.vy = approach(p.vy, 0, FRICTION * 2 * dt);
    if (Math.hypot(p.vx, p.vy) > 0.01) moveWithCollision(p, p.vx * dt, p.vy * dt, solid);
    p.moving = false;
  } else {
    // Normal movement.
    const v = inputVec();
    const targetVx = v.x * D.MOVE_SPEED;
    const targetVy = v.y * D.MOVE_SPEED;
    p.vx = approach(p.vx, targetVx, (v.x !== 0 ? ACCEL : FRICTION) * dt);
    p.vy = approach(p.vy, targetVy, (v.y !== 0 ? ACCEL : FRICTION) * dt);
    const speed = Math.hypot(p.vx, p.vy);
    p.moving = speed > 4;
    if (p.vx > 1) p.facing = 1;
    else if (p.vx < -1) p.facing = -1;
    if (speed > 0.01) moveWithCollision(p, p.vx * dt, p.vy * dt, solid);
  }

  p.animTime += dt;
}

function currentFrame(p) {
  if (p.attackTime > 0) {
    const total = D.ATTACK_FRAMES / D.ATTACK_FPS;
    const elapsed = total - p.attackTime;
    const idx = Math.min(D.ATTACK_FRAMES - 1, Math.floor(elapsed * D.ATTACK_FPS));
    return { sheet: 'attack', idx };
  }
  if (p.moving) return { sheet: 'run',  idx: Math.floor(p.animTime * D.RUN_FPS)  % D.RUN_FRAMES };
  return            { sheet: 'idle', idx: Math.floor(p.animTime * D.IDLE_FPS) % D.IDLE_FRAMES };
}

// Paint one frame of the player into a destination ctx at (dx, dy) sized
// (drawW, drawH). Renderers reuse this so left/right flip is identical.
function paintPlayerFrame(ctx, assets, p, dx, dy, drawW, drawH) {
  const f = currentFrame(p);
  const sheet = assets[f.sheet];
  const sx = f.idx * D.FRAME_W;
  if (p.facing === -1) {
    ctx.save();
    ctx.translate(dx + drawW, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, sx, 0, D.FRAME_W, D.FRAME_H, 0, 0, drawW, drawH);
    ctx.restore();
  } else {
    ctx.drawImage(sheet, sx, 0, D.FRAME_W, D.FRAME_H, dx, dy, drawW, drawH);
  }
}

// ---- Public engine handle -------------------------------------------------
const engine = {
  player: null,
  solid: null,
  assets: null,
  ready: false,
  paused: false,
  onEscape: null,
  _wantAttack: false,
  _wantDash: false,
  // Travel screen state (set when player crosses the world border).
  traveling: false,
  travelTime: 0,
  travelTotal: 0,
  _travelRespawned: false,

  async load() {
    this.assets = await D.loadAssets();
    // Pixel-perfect collision rectangles built from the actual sprite art.
    this.solid = D.buildCollision(this.assets.tilesheet);
    this.player = createPlayer();
    this.ready = true;
  },

  tick(dt) {
    if (!this.ready || this.paused) return;
    if (this.traveling) {
      this.travelTime += dt;
      // Respawn while the scroll is fully open (after CSS unroll completes).
      if (!this._travelRespawned && this.travelTime >= 0.7) {
        this.player.x = D.SPAWN_TILE.col * D.TILE_PX + D.TILE_PX / 2;
        this.player.y = D.SPAWN_TILE.row * D.TILE_PX + D.TILE_PX / 2;
        this.player.vx = 0; this.player.vy = 0;
        this._travelRespawned = true;
      }
      if (this.travelTime >= this.travelTotal) {
        this.traveling = false;
        this.travelTime = 0;
        this._travelRespawned = false;
      }
      return;
    }
    updatePlayer(this.player, dt, this.solid);
  },

  // True while the scroll should be visible. CSS handles the easing — this is
  // simply on for the active "travel hold" window, off before/after.
  travelScrollOn() {
    if (!this.traveling) return false;
    // Show .on from t=0 until the last 0.5s, when it should start closing.
    return this.travelTime < this.travelTotal - 0.5;
  },

  // Renderers call these helpers.
  currentFrame, paintPlayerFrame,
};

window.HVEngine = engine;
