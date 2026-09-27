// The battlefield fills the whole G2 display (576x288). The static scene is
// sent as four 288x144 image containers (the per-container maximum) once per
// screen; everything that moves is text.
export const W = 576
export const H = 288
export const TILE_W = 288
export const TILE_H = 144

// Grey levels (0 = LED off / see-through, 15 = brightest).
// The Even host maps levels non-linearly (simulator 0.9.5 measured:
// 1 -> 38%, 2 -> 51%, 3 -> 62%, 4 -> 70%, 5 -> 77%, 6 -> 84%, 7 -> 90%,
// 8 -> 96%, 9+ -> 100%). Big areas stay at 1-2; detail sits at 3-7.
export const L = {
  OFF: 0,
  FAINT: 1,
  SOFT: 2,
  DIM: 3,
  LOW: 4,
  MID: 6,
  HIGH: 9,
  HUD: 12,
  BRIGHT: 15,
} as const

// Physics (pixels, seconds)
export const GRAVITY = 240
export const POWER_TO_SPEED = 3.8 // power 100 -> 380 px/s
export const WIND_ACCEL = 14 // px/s^2 per wind unit
export const WIND_MAX = 5
export const SIM_DT = 1 / 120

export const ANGLE_MIN = 10
export const ANGLE_MAX = 80
export const ANGLE_STEP = 5 // per swipe / button press: big enough to see
export const POWER_MIN = 10
export const POWER_MAX = 100
export const CHARGE_RATE = 45 // power units per second while holding (10->100 in 2 s)

// Combat
export const MAX_HP = 3
export const SPLASH_R = 30
export const DIRECT_DMG = 2
export const SPLASH_DMG = 1

// Terrain (drawn once per match into the static image; no craters, so the
// image never has to be re-sent while playing)
export const GROUND_MIN_Y = 152
export const GROUND_MAX_Y = 262

// Heroes stand at fixed, cell-aligned spots so their text faces sit exactly
// inside their bodies. Face = 3 text cells in FACE_ROW centred on the hero.
export const HERO_X: [number, number] = [70, 490] // centres of text columns 3 and 24
export const FEET_Y = 238
export const PAD_HALF = 46
export const BAO_SCALE = 2.6
export const NORI_SCALE = 2.3
export const CRITTER_W = 72 // hit box matches the drawn body
export const CRITTER_H = 54

// Text grid for everything that moves (shell, trail, guide, explosions,
// dizzy stars...). Measured in the official simulator: every fullwidth glyph
// and U+3000 is 20 px wide, lines are 27 px apart (the community pong game
// uses the same 28-column grid on real glasses).
export const FX_Y = 72
export const CELL_W = 20
export const CELL_H = 27
export const FX_COLS = 28
export const FX_ROWS = 8

// Timings (seconds)
export const BANNER_TIME = 1.0
export const EXPLODE_TIME = 1.0 // ground hit / miss
export const HIT_TIME = 2.4 // direct or splash hit: blast, dizzy, shake it off
export const CPU_AIM_TIME = 0.9
export const RESULT_DELAY = 1.2
export const FACE_ROW = 5 // y 207..234
