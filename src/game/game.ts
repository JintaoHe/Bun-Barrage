// Match state machine. Pure logic: feed it actions and elapsed time.
import {
  W, MAX_HP, WIND_MAX, ANGLE_MIN, ANGLE_MAX, ANGLE_STEP, POWER_MIN, POWER_MAX, CHARGE_RATE,
  DIRECT_DMG, SPLASH_DMG, SPLASH_R, CRITTER_H, HERO_X, FEET_Y,
  BANNER_TIME, EXPLODE_TIME, HIT_TIME, CPU_AIM_TIME, RESULT_DELAY,
} from './constants'
import {
  type Aim, type Critter, type Rng, type Shot,
  makeRng, makeTerrain, flattenPad, launch, stepShot, cpuAim, clamp,
} from './world'

export type Action =
  | 'scrollUp' | 'scrollDown' // ring / touchpad swipe
  | 'up' | 'down' // phone buttons / keyboard
  | 'chargeStart' | 'chargeEnd' // long press / release
  | 'tap' // start / continue; while charging it also fires
  | 'back' // double tap

export type Screen = 'title' | 'play' | 'result'
export type Phase = 'banner' | 'aim' | 'cpuAim' | 'cpuCharge' | 'flight' | 'explode'
export type Point = { x: number; y: number }
export type Stats = { wins: number; losses: number }

/** Per-critter reaction clocks (seconds since the event, -1 = inactive). */
export type Anim = {
  hop: number // happy
  hit: number // hit: squash -> dizzy -> shake it off
  recoil: number // just fired
  taunt: number // tongue out
  phew: number // sweat drop
}
export const REACT = { hop: 1.4, hit: HIT_TIME, recoil: 0.35, taunt: 1.5, phew: 1.4 } as const

/** A blast being shown: where, what kind, and how long ago. */
export type Blast = { x: number; y: number; t: number; kind: 'ground' | 'hit' | 'miss'; dmg: [number, number] }

export type Game = {
  screen: Screen
  phase: Phase
  timer: number
  time: number // total game time (animation clock)
  ground: Float32Array
  critters: [Critter, Critter]
  hp: [number, number]
  angle: [number, number]
  power: [number, number] // live meter
  lastPower: [number, number] // previous shot's power
  charging: boolean
  chargeT: number
  turn: 0 | 1
  wind: number
  shot: Shot | null
  shotAge: number
  shotBy: 0 | 1
  trail: Point[]
  blast: Blast | null
  anim: [Anim, Anim]
  hintT: number
  /** Crosshair feedback per hero: previous angle + seconds since it moved (-1 = idle), and seconds since a push against the 10°/80° limit. */
  aimMove: [{ from: number; t: number }, { from: number; t: number }]
  aimBump: [number, number]
  message: string // status line (text container)
  /** Set by the app: the glasses still show an older image. Holds the end of a blast / result. */
  presentHold: boolean
  cpuPlan: Aim | null
  cpuStepT: number
  cpuMisses: number
  winner: 0 | 1 | 'draw' | null
  stats: Stats
  round: number
  rng: Rng // gameplay randomness (terrain, wind, CPU)
  fx: Rng // cosmetic randomness
}

export type Effects = { exit?: boolean; statsChanged?: boolean }

export const PLAYER = 0
export const CPU = 1

const newAnim = (): Anim => ({ hop: -1, hit: -1, recoil: -1, taunt: -1, phew: -1 })

export function createGame(seed = Date.now(), stats: Stats = { wins: 0, losses: 0 }): Game {
  const g: Game = {
    screen: 'title',
    phase: 'banner',
    timer: 0,
    time: 0,
    ground: new Float32Array(W),
    critters: [
      { x: HERO_X[0], y: FEET_Y, facing: 1 },
      { x: HERO_X[1], y: FEET_Y, facing: -1 },
    ],
    hp: [MAX_HP, MAX_HP],
    angle: [45, 45],
    power: [55, 55],
    lastPower: [0, 0],
    charging: false,
    chargeT: 0,
    turn: 0,
    wind: 0,
    shot: null,
    shotAge: 0,
    shotBy: 0,
    trail: [],
    blast: null,
    anim: [newAnim(), newAnim()],
    hintT: 0,
    aimMove: [{ from: 45, t: -1 }, { from: 45, t: -1 }],
    aimBump: [-1, -1],
    message: '',
    presentHold: false,
    cpuPlan: null,
    cpuStepT: 0,
    cpuMisses: 0,
    winner: null,
    stats,
    round: 0,
    rng: makeRng(seed),
    fx: makeRng(seed ^ 0x9e3779b9),
  }
  setupField(g)
  return g
}

function setupField(g: Game): void {
  g.ground = makeTerrain(g.rng)
  // Heroes stand on fixed pads so their text faces line up with their bodies
  flattenPad(g.ground, HERO_X[0])
  flattenPad(g.ground, HERO_X[1])
  g.critters = [
    { x: HERO_X[0], y: FEET_Y, facing: 1 },
    { x: HERO_X[1], y: FEET_Y, facing: -1 },
  ]
}

/**
 * The title shows the field of the next match (same hills, same heroes), so
 * starting a match needs no new image: it begins instantly. A new field is
 * made each time we come back to the title, while nobody is playing.
 */
function toTitle(g: Game): void {
  g.screen = 'title'
  g.charging = false
  g.shot = null
  g.blast = null
  g.trail = []
  g.hp = [MAX_HP, MAX_HP]
  g.anim = [newAnim(), newAnim()]
  setupField(g)
}

export function startMatch(g: Game): void {
  g.screen = 'play'
  g.hp = [MAX_HP, MAX_HP]
  g.angle = [45, 45]
  g.power = [55, 55]
  g.lastPower = [0, 0]
  g.charging = false
  g.turn = PLAYER
  g.shot = null
  g.trail = []
  g.blast = null
  g.anim = [newAnim(), newAnim()]
  g.aimMove = [{ from: 45, t: -1 }, { from: 45, t: -1 }]
  g.aimBump = [-1, -1]
  g.cpuPlan = null
  g.cpuMisses = 0
  g.winner = null
  g.round = 0
  newWind(g)
  beginTurn(g)
}

function newWind(g: Game): void {
  const r = g.rng()
  const mag = r < 0.25 ? 0 : r < 0.8 ? 1 + Math.floor(g.rng() * 3) : 4 + Math.floor(g.rng() * 2)
  g.wind = clamp(mag * (g.rng() < 0.5 ? -1 : 1), -WIND_MAX, WIND_MAX)
}

function beginTurn(g: Game): void {
  g.message = g.turn === PLAYER ? 'YOUR TURN!' : "NORI'S TURN"
  g.phase = 'banner'
  g.timer = BANNER_TIME
  g.charging = false
}

/** Power while holding: rises 10 -> 100, then falls back (over-holding costs you). */
export function chargePower(t: number): number {
  const span = POWER_MAX - POWER_MIN
  const v = (t * CHARGE_RATE) % (span * 2)
  return Math.round(POWER_MIN + (v <= span ? v : span * 2 - v))
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export function dispatch(g: Game, a: Action): Effects {
  if (g.screen === 'title') {
    if (a === 'back') return { exit: true }
    if (a === 'tap' || a === 'chargeStart') startMatch(g)
    return {}
  }
  if (g.screen === 'result') {
    if (g.timer > 0) return {}
    if (a === 'back' || a === 'tap' || a === 'chargeStart') toTitle(g)
    return {}
  }
  if (a === 'back') {
    toTitle(g)
    return {}
  }
  if (g.turn !== PLAYER) return {}

  // Acting during the "YOUR TURN" banner skips it
  if (g.phase === 'banner' && a !== 'chargeEnd') {
    g.phase = 'aim'
    g.message = ''
    if (a === 'tap') return {}
  }
  if (g.phase !== 'aim') return {}

  switch (a) {
    case 'up':
    case 'scrollUp':
      turnAim(g, PLAYER, ANGLE_STEP)
      break
    case 'down':
    case 'scrollDown':
      turnAim(g, PLAYER, -ANGLE_STEP)
      break
    case 'chargeStart':
      if (!g.charging) {
        g.charging = true
        g.chargeT = 0
        g.power[0] = POWER_MIN
      }
      break
    case 'chargeEnd':
      if (g.charging) fire(g, PLAYER)
      break
    case 'tap':
      if (g.charging) fire(g, PLAYER) // fallback if a release event is lost
      else g.hintT = 2
      break
  }
  return {}
}

/** Move a hero's aim; records the move (for the crosshair trail) or a bump at the limit. */
function turnAim(g: Game, who: 0 | 1, delta: number): void {
  const next = clamp(g.angle[who] + delta, ANGLE_MIN, ANGLE_MAX)
  if (next === g.angle[who]) { g.aimBump[who] = 0; return }
  g.aimMove[who] = { from: g.angle[who], t: 0 }
  g.angle[who] = next
}

function fire(g: Game, who: 0 | 1): void {
  g.charging = false
  g.lastPower[who] = g.power[who]
  g.shot = launch(g.critters[who], g.angle[who], g.power[who], g.wind)
  g.shotBy = who
  g.shotAge = 0
  g.trail = [{ x: g.shot.x, y: g.shot.y }]
  g.phase = 'flight'
  g.message = ''
  g.blast = null
  g.anim[who].recoil = 0
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------
function tickAnims(g: Game, dt: number): void {
  for (const a of g.anim) {
    for (const k of ['hop', 'hit', 'recoil', 'taunt', 'phew'] as const) {
      if (a[k] < 0) continue
      a[k] += dt
      if (a[k] > REACT[k] && !(k === 'hop' && g.screen === 'result')) a[k] = -1
    }
  }
  if (g.hintT > 0) g.hintT = Math.max(0, g.hintT - dt)
  for (const i of [0, 1] as const) {
    const m = g.aimMove[i]
    if (m.t >= 0) m.t = m.t + dt > AIM_TRAIL_TIME ? -1 : m.t + dt
    if (g.aimBump[i] >= 0) g.aimBump[i] = g.aimBump[i] + dt > AIM_BUMP_TIME ? -1 : g.aimBump[i] + dt
  }
}
export const AIM_TRAIL_TIME = 0.3
export const AIM_BUMP_TIME = 0.4
const CPU_AIM_STEP = 0.11 // seconds per 5° as Nori swings its aim

export function update(g: Game, dt: number): Effects {
  g.time += dt
  tickAnims(g, dt)
  let fx: Effects = {}

  if (g.screen === 'result') {
    if (g.timer > 0 && !g.presentHold) g.timer = Math.max(0, g.timer - dt)
    const w = g.winner
    if ((w === 0 || w === 1) && g.anim[w].hop < 0) g.anim[w].hop = 0
    return fx
  }
  if (g.screen !== 'play') return fx

  if (g.charging) {
    g.chargeT += dt
    g.power[0] = chargePower(g.chargeT)
  }

  switch (g.phase) {
    case 'banner':
      g.timer -= dt
      if (g.timer <= 0) {
        g.message = ''
        if (g.turn === PLAYER) g.phase = 'aim'
        else {
          g.phase = 'cpuAim'
          g.message = 'NORI IS AIMING...'
          g.timer = CPU_AIM_TIME
          g.cpuPlan = cpuAim(g.ground, g.critters, CPU, PLAYER, g.wind, g.cpuMisses, g.rng)
          g.cpuStepT = 0
          g.power[1] = POWER_MIN
        }
      }
      break

    case 'cpuAim': {
      g.timer -= dt
      // Nori swings its crosshair toward its plan one 5° step at a time
      const target = g.cpuPlan!.angle
      g.cpuStepT += dt
      if (g.angle[1] !== target && g.cpuStepT >= CPU_AIM_STEP) {
        g.cpuStepT = 0
        const d = target - g.angle[1]
        if (Math.abs(d) <= ANGLE_STEP) { g.aimMove[1] = { from: g.angle[1], t: 0 }; g.angle[1] = target }
        else turnAim(g, CPU, Math.sign(d) * ANGLE_STEP)
      }
      if (g.timer <= 0 && g.angle[1] === target) {
        g.phase = 'cpuCharge'
        g.message = 'NORI IS CHARGING!'
        g.chargeT = 0
      }
      break
    }

    case 'cpuCharge': {
      g.chargeT += dt
      const plan = g.cpuPlan!
      g.power[1] = Math.min(plan.power, chargePower(g.chargeT))
      if (g.power[1] >= plan.power) {
        g.power[1] = plan.power
        fire(g, CPU)
      }
      break
    }

    case 'flight': {
      const s = g.shot!
      const hit = stepShot(s, dt, g.ground, g.critters, g.shotBy, g.shotAge)
      g.shotAge += dt
      const last = g.trail[g.trail.length - 1]
      if (Math.hypot(s.x - last.x, s.y - last.y) >= 8) g.trail.push({ x: s.x, y: s.y })
      if (hit.kind !== 'none') fx = resolve(g, hit)
      else if (g.shotAge > 10) fx = resolve(g, { kind: 'out', x: s.x, y: s.y })
      break
    }

    case 'explode':
      if (g.blast) g.blast.t += dt
      g.timer -= dt
      // (presentHold: only if a static image is still on its way)
      if (g.timer <= 0 && !g.presentHold) fx = endShot(g)
      break
  }
  return fx
}

type Hit = Exclude<ReturnType<typeof stepShot>, { kind: 'none' }>

function resolve(g: Game, hit: Hit): Effects {
  const shooter = g.shotBy
  const target: 0 | 1 = shooter === PLAYER ? CPU : PLAYER
  const name = (i: 0 | 1) => (i === PLAYER ? 'BAO' : 'NORI')
  g.shot = null
  g.phase = 'explode'

  const dmg: [number, number] = [0, 0]
  if (hit.kind === 'out') {
    g.blast = { x: clamp(hit.x, 0, W - 1), y: hit.y, t: 0, kind: 'miss', dmg }
    g.timer = 0.8
  } else {
    for (const i of [PLAYER, CPU] as const) {
      const c = g.critters[i]
      if (hit.kind === 'critter' && hit.who === i) dmg[i] = DIRECT_DMG
      else if (Math.hypot(hit.x - c.x, hit.y - (c.y - CRITTER_H / 2)) <= SPLASH_R) dmg[i] = SPLASH_DMG
      if (dmg[i] > 0) {
        g.hp[i] = Math.max(0, g.hp[i] - dmg[i])
        g.anim[i].hit = 0
      }
    }
    const anyHit = dmg[0] + dmg[1] > 0
    g.blast = { x: hit.x, y: hit.y, t: 0, kind: anyHit ? 'hit' : 'ground', dmg }
    g.timer = anyHit ? HIT_TIME : EXPLODE_TIME
  }
  const damagedTarget = dmg[target] > 0

  if (hit.kind === 'out') g.message = 'MISS!'
  else if (damagedTarget) g.message = `${hit.kind === 'critter' ? 'BONK!' : 'SPLASH!'}  ${name(target)} -${dmg[target]}`
  else if (dmg[shooter] > 0) g.message = `OOPS!  ${name(shooter)} -${dmg[shooter]}`
  else g.message = 'SO CLOSE...'

  // Reactions
  const tc = g.critters[target]
  if (damagedTarget) {
    if (g.hp[shooter] > 0 && dmg[shooter] === 0) g.anim[shooter].hop = 0
  } else if (dmg[shooter] === 0) {
    const near = hit.kind !== 'out' && Math.abs(hit.x - tc.x) < 70
    if (near) g.anim[target].phew = 0
    else if (target === CPU) g.anim[CPU].taunt = 0
    else g.anim[PLAYER].hop = 0
    if (!near && hit.kind !== 'out') g.message = 'MISSED!'
  }

  if (shooter === CPU) g.cpuMisses = damagedTarget ? 1 : g.cpuMisses + 1
  return {}
}

function endShot(g: Game): Effects {
  g.blast = null
  g.trail = []

  const dead0 = g.hp[0] <= 0
  const dead1 = g.hp[1] <= 0
  if (dead0 || dead1) {
    g.winner = dead0 && dead1 ? 'draw' : dead1 ? PLAYER : CPU
    if (g.winner === PLAYER) g.stats.wins++
    else if (g.winner === CPU) g.stats.losses++
    g.timer = RESULT_DELAY
    g.screen = 'result'
    g.message = g.winner === PLAYER ? 'YOU WIN!' : g.winner === CPU ? 'NORI WINS!' : 'DRAW!'
    return { statsChanged: true }
  }

  g.turn = g.turn === PLAYER ? CPU : PLAYER
  if (g.turn === PLAYER) g.round++
  newWind(g)
  beginTurn(g)
  return {}
}

/** The reaction a critter is showing right now (for poses and effects). */
export type Mood = 'normal' | 'aim' | 'recoil' | 'happy' | 'hitX' | 'dizzy' | 'shake' | 'phew' | 'taunt' | 'ko' | 'win'
export function moodOf(g: Game, i: 0 | 1): Mood {
  const a = g.anim[i]
  if (g.hp[i] <= 0) return 'ko'
  if (g.screen === 'result' && g.winner === i) return 'win'
  if (a.hit >= 0) return a.hit < 0.45 ? 'hitX' : a.hit < 1.9 ? 'dizzy' : 'shake'
  if (a.recoil >= 0) return 'recoil'
  if (a.taunt >= 0) return 'taunt'
  if (a.phew >= 0) return 'phew'
  if (a.hop >= 0) return 'happy'
  return 'normal'
}
