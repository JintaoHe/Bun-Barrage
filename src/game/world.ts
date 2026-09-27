// Terrain, ballistics and the CPU's aiming. Pure logic, no rendering.
import {
  W, H, GRAVITY, POWER_TO_SPEED, WIND_ACCEL, SIM_DT, FEET_Y, PAD_HALF,
  GROUND_MIN_Y, GROUND_MAX_Y, CELL_W, CELL_H,
  CRITTER_W, CRITTER_H, ANGLE_MIN, ANGLE_MAX, POWER_MIN, POWER_MAX,
} from './constants'

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) so matches and tests are reproducible
// ---------------------------------------------------------------------------
export type Rng = () => number

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---------------------------------------------------------------------------
// Terrain: ground[x] = y of the top ground pixel in column x
// ---------------------------------------------------------------------------
export function makeTerrain(rng: Rng): Float32Array {
  const g = new Float32Array(W)
  const base = 222 + rng() * 16
  const waves = [0, 1, 2].map((i) => ({
    amp: (26 - i * 8) * (0.6 + rng() * 0.6),
    freq: (1 + i * 1.7 + rng()) * (Math.PI * 2) / W,
    phase: rng() * Math.PI * 2,
  }))
  for (let x = 0; x < W; x++) {
    let y = base
    for (const w of waves) y += Math.sin(x * w.freq + w.phase) * w.amp
    // A friendly hill in the middle so direct fire is rarely possible
    const mid = (x - W / 2) / (W * 0.18)
    y -= 60 * Math.exp(-mid * mid)
    // Soft ceiling: squash tall peaks smoothly instead of flattening them
    const knee = GROUND_MIN_Y + 34
    if (y < knee) y = knee - (knee - y) * 0.45
    g[x] = clamp(y, GROUND_MIN_Y, GROUND_MAX_Y)
  }
  return g
}

/** Level a pad at exactly FEET_Y around cx, then ramp smoothly back to the terrain. */
export function flattenPad(ground: Float32Array, cx: number, half = PAD_HALF): void {
  const y = FEET_Y
  for (let x = cx - half; x <= cx + half; x++) ground[clampX(x)] = y
  const ramp = 30
  for (let i = 1; i <= ramp; i++) {
    const t = i / (ramp + 1)
    const e = t * t * (3 - 2 * t)
    for (const x of [cx - half - i, cx + half + i]) {
      if (x < 0 || x >= W) continue
      ground[x] = y + (ground[x] - y) * e
    }
  }
}

// ---------------------------------------------------------------------------
// Ballistics
// ---------------------------------------------------------------------------
export type Shot = {
  x: number
  y: number
  vx: number
  vy: number
  ax: number
}

export type Critter = {
  x: number // centre column
  y: number // feet row (ground surface)
  facing: 1 | -1
}

export function launch(c: Critter, angleDeg: number, power: number, wind: number): Shot {
  const a = (angleDeg * Math.PI) / 180
  const v = power * POWER_TO_SPEED
  const m = muzzle(c, angleDeg)
  return {
    x: m.x,
    y: m.y,
    vx: Math.cos(a) * v * c.facing,
    vy: -Math.sin(a) * v,
    ax: wind * WIND_ACCEL,
  }
}

/**
 * Aiming is shown with a crosshair ⊙ at a fixed distance from the hero
 * (like the classic worm-artillery crosshair). A text cell is 20x27 px, too
 * coarse for 5° steps, so the crosshair can also sit on a second text layer
 * shifted by half a cell (BAR_DX, BAR_DY). This table (found by search: ring
 * 110-135 px around (70, 215), max error 3.3°) gives every 5° step its own
 * spot, so each swipe visibly moves the crosshair. Facing right; mirrored for
 * facing left. `bar` = on the shifted layer.
 */
export const BAR_DX = CELL_W / 2
export const BAR_DY = 13
export type AimSpot = { r: number; c: number; bar: boolean }
const AIM_SPOTS: [boolean, number, number][] = [
  [false, 4, 9], [true, 3, 9], [false, 3, 9], [false, 3, 8], [true, 2, 8], [false, 2, 8], [false, 2, 7], [true, 1, 7],
  [true, 1, 6], [false, 1, 7], [false, 1, 6], [true, 0, 5], [false, 1, 5], [true, 0, 4], [false, 0, 4],
] // angles 10, 15, ... 80

export function aimSpot(c: Critter, angle: number): AimSpot {
  const i = Math.max(0, Math.min(AIM_SPOTS.length - 1, Math.round((angle - 10) / 5)))
  const [bar, r, col] = AIM_SPOTS[i]
  const dr = Math.round((c.y - FEET_Y) / CELL_H)
  // mirror about the hero: the 28-column grid is 560 px wide, heroes at 70 / 490
  const heroCol = Math.floor(c.x / CELL_W)
  const cc = c.facing > 0 ? col + (heroCol - 3) : (bar ? 26 - col : 27 - col) - (24 - heroCol)
  return { r: r + dr, c: cc, bar }
}

/** Where the shell leaves: just outside the body, along the aim. */
export function muzzle(c: Critter, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180
  return { x: c.x + Math.cos(a) * 46 * c.facing, y: c.y - 23 - Math.sin(a) * 46 }
}

export type Impact =
  | { kind: 'none' }
  | { kind: 'ground'; x: number; y: number }
  | { kind: 'critter'; x: number; y: number; who: number }
  | { kind: 'out'; x: number; y: number }

export function hitsCritter(c: Critter, x: number, y: number): boolean {
  const half = CRITTER_W / 2
  return x >= c.x - half && x <= c.x + half && y >= c.y - CRITTER_H && y <= c.y
}

/**
 * Advance a shot by `dt` seconds in fixed sub-steps. Returns the first impact.
 * `ignore` = index of the shooter, so the shell cannot hit its own barrel on
 * the first few frames.
 */
export function stepShot(
  s: Shot,
  dt: number,
  ground: Float32Array,
  critters: readonly Critter[],
  shooter: number,
  age: number,
): Impact {
  let t = 0
  while (t < dt - 1e-9) {
    const h = Math.min(SIM_DT, dt - t)
    s.vx += s.ax * h
    s.vy += GRAVITY * h
    s.x += s.vx * h
    s.y += s.vy * h
    t += h
    if (s.x < -4 || s.x > W + 4 || s.y > H + 4) return { kind: 'out', x: s.x, y: s.y }
    for (let i = 0; i < critters.length; i++) {
      if (i === shooter && age + t < 0.2) continue
      if (hitsCritter(critters[i], s.x, s.y)) return { kind: 'critter', x: s.x, y: s.y, who: i }
    }
    const col = Math.round(s.x)
    if (col >= 0 && col < W && s.y >= ground[col]) return { kind: 'ground', x: s.x, y: ground[col] }
  }
  return { kind: 'none' }
}

/** Simulate a whole flight. Used by the CPU and by tests. */
export function simulate(
  ground: Float32Array,
  critters: readonly Critter[],
  shooter: number,
  angle: number,
  power: number,
  wind: number,
  maxTime = 8,
): Exclude<Impact, { kind: 'none' }> {
  const s = launch(critters[shooter], angle, power, wind)
  let age = 0
  while (age < maxTime) {
    const r = stepShot(s, 1 / 30, ground, critters, shooter, age)
    age += 1 / 30
    if (r.kind !== 'none') return r
  }
  return { kind: 'out', x: s.x, y: s.y }
}

/**
 * Dots for the aiming guide: the first part of the arc under gravity only
 * (wind is left out on purpose, reading it is the player's job). Stops at
 * the ground. `span` = seconds of flight to show.
 */
export function guidePath(
  ground: Float32Array,
  c: Critter,
  angle: number,
  power: number,
  span = 0.55,
  step = 0.045,
): { x: number; y: number }[] {
  const s = launch(c, angle, power, 0)
  const pts: { x: number; y: number }[] = []
  for (let t = step; t <= span + 1e-9; t += step) {
    const x = s.x + s.vx * t
    const y = s.y + s.vy * t + 0.5 * GRAVITY * t * t
    if (x < 0 || x >= W || y > ground[Math.round(x)]) break
    pts.push({ x, y })
  }
  return pts
}

// ---------------------------------------------------------------------------
// CPU aiming: brute-force search, then add human-ish error that shrinks each
// time it misses (so it "zeroes in" like a real player).
// ---------------------------------------------------------------------------
export type Aim = { angle: number; power: number }

export function bestAim(
  ground: Float32Array,
  critters: readonly Critter[],
  shooter: number,
  target: number,
  wind: number,
): Aim {
  const t = critters[target]
  const tx = t.x
  const ty = t.y - CRITTER_H / 2
  let best: Aim = { angle: 45, power: 60 }
  let bestScore = Infinity
  for (let angle = 15; angle <= 80; angle += 5) {
    for (let power = 25; power <= POWER_MAX; power += 2) {
      const r = simulate(ground, critters, shooter, angle, power, wind)
      let score: number
      if (r.kind === 'critter') score = r.who === target ? 0 : 999
      else score = Math.hypot(r.x - tx, r.y - ty)
      // Prefer mid angles and moderate power (looks natural, more robust)
      score += Math.abs(angle - 50) * 0.02
      if (score < bestScore) {
        bestScore = score
        best = { angle, power }
      }
    }
  }
  return best
}

export function cpuAim(
  ground: Float32Array,
  critters: readonly Critter[],
  shooter: number,
  target: number,
  wind: number,
  misses: number,
  rng: Rng,
  skill = 1,
): Aim {
  const ideal = bestAim(ground, critters, shooter, target, wind)
  const spread = Math.max(0.12, Math.pow(0.6, misses)) / skill
  return {
    angle: clamp(Math.round(ideal.angle + gauss(rng) * 6 * spread), ANGLE_MIN, ANGLE_MAX),
    power: clamp(Math.round(ideal.power + gauss(rng) * 9 * spread), POWER_MIN, POWER_MAX),
  }
}

// ---------------------------------------------------------------------------
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function clampX(x: number): number {
  return clamp(x, 0, W - 1)
}
