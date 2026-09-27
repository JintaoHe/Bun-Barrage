import { describe, expect, it } from 'vitest'
import { chargePower, createGame, dispatch, startMatch, update, moodOf, type Game } from '../src/game/game'
import { fxCells, fxText, barText, FACES } from '../src/game/fx'
import { bestAim, cpuAim, guidePath, makeRng, simulate } from '../src/game/world'
import { W, MAX_HP, ANGLE_MAX, ANGLE_MIN, POWER_MIN, POWER_MAX, GROUND_MIN_Y, FEET_Y, HERO_X, FACE_ROW, CELL_W, CELL_H, FX_Y } from '../src/game/constants'
import { FONT } from '../src/game/art'
import { Frame } from '../src/game/gfx'
import { render } from '../src/game/render'

const step = (g: Game, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 60) update(g, 1 / 60)
}
const toAim = (g: Game) => {
  for (let i = 0; i < 600 && !(g.phase === 'aim' && g.turn === 0); i++) update(g, 1 / 60)
}
/** Fire with an exact power, as a long press would. */
const fireAt = (g: Game, angle: number, power: number) => {
  g.angle[0] = angle
  dispatch(g, 'chargeStart')
  g.power[0] = power
  dispatch(g, 'chargeEnd')
}

describe('font', () => {
  it('every glyph is 3x5', () => {
    for (const [ch, rows] of Object.entries(FONT)) {
      expect(rows.length, ch).toBe(5)
      for (const r of rows) expect(r.length, ch).toBe(3)
    }
  })
})

describe('world', () => {
  it('max power reaches across the whole field on flat ground', () => {
    const ground = new Float32Array(W).fill(250)
    const critters = [{ x: 40, y: 250, facing: 1 as const }, { x: W + 200, y: 250, facing: -1 as const }]
    const r = simulate(ground, critters, 0, 45, 100, 0)
    expect(r.x).toBeGreaterThan(W - 60)
  })

  it('wind pushes shots downwind', () => {
    const ground = new Float32Array(W).fill(250)
    const critters = [{ x: 100, y: 250, facing: 1 as const }, { x: 9999, y: 250, facing: -1 as const }]
    const calm = simulate(ground, critters, 0, 50, 60, 0)
    expect(simulate(ground, critters, 0, 50, 60, 4).x).toBeGreaterThan(calm.x)
    expect(simulate(ground, critters, 0, 50, 60, -4).x).toBeLessThan(calm.x)
  })

  it('shots leave the ground untouched (no craters: the image stays static)', () => {
    const g = createGame(5)
    startMatch(g)
    const before = Float32Array.from(g.ground)
    toAim(g)
    fireAt(g, 45, 30)
    for (let i = 0; i < 2000 && g.phase === 'flight'; i++) update(g, 1 / 60)
    expect(g.blast?.kind).toBe('ground')
    expect(Array.from(g.ground)).toEqual(Array.from(before))
  })

  it('aim guide follows the no-wind arc and grows with power', () => {
    const g = createGame(3)
    startMatch(g)
    const c = g.critters[0]
    const weak = guidePath(g.ground, c, 45, 30)
    const strong = guidePath(g.ground, c, 45, 90)
    expect(strong.length).toBeGreaterThan(0)
    const far = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x))
    expect(far(strong)).toBeGreaterThan(far(weak))
    // guide dots lie on the real (calm) trajectory
    const r = simulate(g.ground, [c, { x: 9999, y: 0, facing: -1 }], 0, 45, 90, 0)
    expect(r.kind).not.toBe('none')
  })

  it('CPU ideal aim lands on the player in almost every field', () => {
    let hits = 0
    for (let seed = 1; seed <= 20; seed++) {
      const g = createGame(seed)
      startMatch(g)
      const aim = bestAim(g.ground, g.critters, 1, 0, g.wind)
      const r = simulate(g.ground, g.critters, 1, aim.angle, aim.power, g.wind)
      if (r.kind === 'critter' ? r.who === 0 : Math.abs(r.x - g.critters[0].x) < 30) hits++
    }
    expect(hits).toBeGreaterThanOrEqual(18)
  })

  it('CPU error shrinks as it keeps missing', () => {
    const g = createGame(3)
    startMatch(g)
    const ideal = bestAim(g.ground, g.critters, 1, 0, g.wind)
    const spreadAt = (misses: number) => {
      const rng = makeRng(99)
      let sum = 0
      for (let i = 0; i < 40; i++) {
        const a = cpuAim(g.ground, g.critters, 1, 0, g.wind, misses, rng)
        sum += Math.abs(a.angle - ideal.angle) + Math.abs(a.power - ideal.power)
      }
      return sum / 40
    }
    expect(spreadAt(4)).toBeLessThan(spreadAt(0))
  })
})

describe('long-press power', () => {
  it('rises from 10 to 100 then falls back', () => {
    expect(chargePower(0)).toBe(POWER_MIN)
    expect(chargePower(1)).toBe(55)
    expect(chargePower(2)).toBe(POWER_MAX)
    expect(chargePower(3)).toBe(55)
    expect(chargePower(4)).toBe(POWER_MIN)
  })

  it('hold charges, release fires with the charged power', () => {
    const g = createGame(1)
    startMatch(g)
    toAim(g)
    dispatch(g, 'chargeStart')
    expect(g.charging).toBe(true)
    step(g, 0.5)
    const p = g.power[0]
    expect(p).toBeGreaterThan(28)
    expect(p).toBeLessThan(38)
    dispatch(g, 'chargeEnd')
    expect(g.phase).toBe('flight')
    expect(g.lastPower[0]).toBe(p)
  })

  it('a tap while charging also fires (lost release event)', () => {
    const g = createGame(1)
    startMatch(g)
    toAim(g)
    dispatch(g, 'chargeStart')
    step(g, 0.3)
    dispatch(g, 'tap')
    expect(g.phase).toBe('flight')
  })

  it('a plain tap only shows the hint', () => {
    const g = createGame(1)
    startMatch(g)
    toAim(g)
    dispatch(g, 'tap')
    expect(g.phase).toBe('aim')
    expect(g.hintT).toBeGreaterThan(0)
  })

  it('release without a press does nothing', () => {
    const g = createGame(1)
    startMatch(g)
    toAim(g)
    dispatch(g, 'chargeEnd')
    expect(g.phase).toBe('aim')
  })

  it('long press during the banner skips it and starts charging', () => {
    const g = createGame(1)
    startMatch(g)
    expect(g.phase).toBe('banner')
    dispatch(g, 'chargeStart')
    expect(g.phase).toBe('aim')
    expect(g.charging).toBe(true)
  })
})

describe('match flow', () => {
  it('title -> play on tap, double tap on title asks to exit', () => {
    const g = createGame(1)
    expect(dispatch(g, 'back').exit).toBe(true)
    dispatch(g, 'tap')
    expect(g.screen).toBe('play')
    expect(g.hp).toEqual([MAX_HP, MAX_HP])
  })

  it('swipes change the angle within range; input is ignored on the CPU turn', () => {
    const g = createGame(1)
    startMatch(g)
    toAim(g)
    dispatch(g, 'scrollUp')
    expect(g.angle[0]).toBe(50)
    for (let i = 0; i < 100; i++) dispatch(g, 'scrollUp')
    expect(g.angle[0]).toBe(ANGLE_MAX)
    for (let i = 0; i < 100; i++) dispatch(g, 'scrollDown')
    expect(g.angle[0]).toBe(ANGLE_MIN)
    fireAt(g, 45, 20)
    for (let i = 0; i < 60 * 12 && g.turn === 0; i++) update(g, 1 / 60)
    expect(g.turn).toBe(1)
    const before = [...g.angle]
    dispatch(g, 'scrollUp')
    dispatch(g, 'chargeStart')
    expect(g.angle).toEqual(before)
    expect(g.charging).toBe(false)
  })

  it('CPU visibly charges before firing', () => {
    const g = createGame(4)
    startMatch(g)
    toAim(g)
    fireAt(g, 45, 10)
    g.shot!.x = -50
    let sawCharge = false
    for (let i = 0; i < 60 * 15 && !(g.turn === 1 && g.phase === 'flight'); i++) {
      update(g, 1 / 60)
      if (g.phase === 'cpuCharge') sawCharge = true
    }
    expect(sawCharge).toBe(true)
    expect(g.phase).toBe('flight')
  })

  it('a full match against a passive player ends with the CPU winning', () => {
    const g = createGame(5)
    startMatch(g)
    let guard = 0
    while (g.screen === 'play' && guard++ < 60 * 60 * 5) {
      if (g.phase === 'aim') {
        fireAt(g, 45, 30)
        g.shot!.x = -50 // player "passes"
      }
      update(g, 1 / 60)
    }
    expect(g.screen).toBe('result')
    expect(g.winner).toBe(1)
    expect(g.stats.losses).toBe(1)
  })

  it('result screen ignores input briefly, then returns to title', () => {
    const g = createGame(5)
    startMatch(g)
    g.hp[1] = 1
    toAim(g)
    const aim = bestAim(g.ground, g.critters, 0, 1, g.wind)
    fireAt(g, aim.angle, aim.power)
    let guard = 0
    while (g.screen === 'play' && guard++ < 2000) update(g, 1 / 60)
    expect(g.screen).toBe('result')
    expect(g.winner).toBe(0)
    dispatch(g, 'tap')
    expect(g.screen).toBe('result')
    step(g, 1.4)
    dispatch(g, 'tap')
    expect(g.screen).toBe('title')
  })

  it('reactions: hitter hops, target gets dizzy', () => {
    const g = createGame(5)
    startMatch(g)
    toAim(g)
    const aim = bestAim(g.ground, g.critters, 0, 1, g.wind)
    fireAt(g, aim.angle, aim.power)
    for (let i = 0; i < 2000 && g.phase === 'flight'; i++) update(g, 1 / 60)
    expect(g.hp[1]).toBeLessThan(MAX_HP)
    expect(g.anim[1].hit).toBeGreaterThanOrEqual(0)
    expect(g.anim[0].hop).toBeGreaterThanOrEqual(0)
  })

  it('heroes stand on flat pads at fixed spots, faces sit inside their bodies', () => {
    const f = new Frame()
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame(seed)
      startMatch(g)
      expect(Math.min(...g.ground)).toBeGreaterThanOrEqual(144)
      g.critters.forEach((c, i) => {
        expect(c.x).toBe(HERO_X[i])
        expect(c.y).toBe(FEET_Y)
        for (let x = c.x - 40; x <= c.x + 40; x++) expect(g.ground[x]).toBe(FEET_Y)
      })
      render(g, f)
      // each 3-cell face sits inside its body: dark behind the text, outline just outside it
      const y = Math.floor(FX_Y + FACE_ROW * CELL_H + CELL_H / 2)
      for (const cx of HERO_X) {
        for (const dx of [-CELL_W, 0, CELL_W]) expect(f.px[y * W + cx + dx]).toBeLessThanOrEqual(3)
        const edgeWithin = (from: number, dir: number) => {
          for (let k = 0; k < 14; k++) if (f.px[y * W + from + dir * k] === 13) return true
          return false
        }
        expect(edgeWithin(cx - 30, -1)).toBe(true)
        expect(edgeWithin(cx + 30, 1)).toBe(true)
      }
    }
  })

  it('title shows the next field: starting a match changes no pixel; back to title makes a new field', () => {
    const f = new Frame()
    const g = createGame(21)
    render(g, f)
    const title = Uint8Array.from(f.px)
    dispatch(g, 'tap') // start
    expect(g.screen).toBe('play')
    render(g, f)
    expect(f.px.every((v, k) => v === title[k])).toBe(true)
    const ground = Float32Array.from(g.ground)
    dispatch(g, 'back') // to title: next match's field
    expect(g.screen).toBe('title')
    expect(Array.from(g.ground)).not.toEqual(Array.from(ground))
  })

  it('the image never changes during a match (only text does)', () => {
    const f = new Frame()
    const g = createGame(9)
    startMatch(g)
    render(g, f)
    const first = Uint8Array.from(f.px)
    let frames = 0
    for (let i = 0; i < 60 * 120 && g.screen === 'play'; i++) {
      if (g.turn === 0 && g.phase === 'aim') fireAt(g, 30 + (i % 50), 40 + (i % 60))
      update(g, 1 / 60)
      if (i % 15 === 0) {
        render(g, f)
        frames++
        expect(f.px.every((v, k) => v === first[k])).toBe(true)
      }
    }
    expect(frames).toBeGreaterThan(20)
  }, 20000)

  it('faces are kaomoji on the text grid and follow the mood', () => {
    const g = createGame(5)
    startMatch(g)
    const row = () => fxText(fxCells(g, 1)).split('\n')[FACE_ROW]
    expect(row()).toContain(FACES.normal)
    toAim(g)
    const aim = bestAim(g.ground, g.critters, 0, 1, g.wind)
    fireAt(g, aim.angle, aim.power)
    for (let i = 0; i < 2000 && g.phase === 'flight'; i++) update(g, 1 / 60)
    expect(row()).toContain(FACES.hitX)
    step(g, 0.6)
    expect(row()).toContain(FACES.dizzy)
    expect(row()).toContain(FACES.happy)
  })

  it('status line follows the turn: banner, hit/miss message, result', () => {
    const g = createGame(5)
    startMatch(g)
    expect(g.message).toBe('YOUR TURN!')
    toAim(g)
    expect(g.message).toBe('')
    const aim = bestAim(g.ground, g.critters, 0, 1, g.wind)
    fireAt(g, aim.angle, aim.power)
    for (let i = 0; i < 2000 && g.phase === 'flight'; i++) update(g, 1 / 60)
    expect(g.message).toMatch(/BONK!|SPLASH!/)
  })

  it('blast plays in real time, then waits if a scene image is still being sent', () => {
    const g = createGame(5)
    startMatch(g)
    toAim(g)
    fireAt(g, 45, 30)
    for (let i = 0; i < 2000 && g.phase === 'flight'; i++) update(g, 1 / 60)
    expect(g.phase).toBe('explode')
    expect(g.blast).not.toBeNull()
    g.presentHold = true
    step(g, 3)
    expect(g.phase).toBe('explode') // animation done, but an image isn't on the glasses yet
    expect(g.blast!.t).toBeGreaterThan(2.5)
    g.presentHold = false
    step(g, 0.1)
    expect(g.phase).not.toBe('explode')
    expect(g.blast).toBeNull()
  })

  it('a hit plays hit -> dizzy -> shake-off -> normal', () => {
    const g = createGame(5)
    startMatch(g)
    toAim(g)
    const aim = bestAim(g.ground, g.critters, 0, 1, g.wind)
    fireAt(g, aim.angle, aim.power)
    for (let i = 0; i < 2000 && g.phase === 'flight'; i++) update(g, 1 / 60)
    const seen: string[] = []
    for (let i = 0; i < 60 * 3; i++) {
      update(g, 1 / 60)
      const m = moodOf(g, 1)
      if (seen[seen.length - 1] !== m) seen.push(m)
    }
    expect(seen).toEqual(expect.arrayContaining(['dizzy', 'shake', 'normal']))
    expect(seen.indexOf('dizzy')).toBeLessThan(seen.indexOf('shake'))
  })

  it('effects grid: shell, guide and blast appear as aligned fullwidth cells', () => {
    const g = createGame(5)
    startMatch(g)
    toAim(g)
    // aiming: a crosshair ⊙ that moves on every 5° step (on either text layer)
    const spot = () => { const c = fxCells(g, 0).find((q) => q.ch === '⊙')!; return `${c.bar ? 'B' : 'A'}${c.r},${c.c}` }
    const seen = new Set<string>()
    for (let a = ANGLE_MIN; a <= ANGLE_MAX; a += 5) { g.angle[0] = a; seen.add(spot()) }
    expect(seen.size).toBe((ANGLE_MAX - ANGLE_MIN) / 5 + 1)
    g.angle[0] = 45
    expect(barText(fxCells(g, 0))).toContain('⊙') // 45° sits on the shifted layer
    // a swipe leaves a trail dot at the old spot for a moment
    dispatch(g, 'scrollUp')
    expect(fxCells(g, 0).some((c) => c.ch === '・')).toBe(true)
    step(g, 0.5)
    expect(fxCells(g, 0).some((c) => c.ch === '・')).toBe(false)
    // pushing past the limit makes it blink
    g.angle[0] = ANGLE_MAX
    dispatch(g, 'scrollUp')
    expect(g.aimBump[0]).toBe(0)
    expect(fxCells(g, 0).some((c) => c.ch === '⊙')).toBe(false)
    fireAt(g, 50, 70)
    step(g, 0.4)
    const flying = fxText(fxCells(g, 0.4))
    expect(fxCells(g, 0.4).some((c) => c.ch === '●' && c.r !== FACE_ROW)).toBe(true) // the shell
    for (const row of flying.split('\n')) {
      expect([...row].length).toBeLessThanOrEqual(28)
      for (const ch of row) expect(ch.charCodeAt(0)).toBeGreaterThan(0x2000) // no half-width chars
    }
  })

  it('renders every screen and keeps terrain below the HUD', () => {
    const f = new Frame()
    for (let seed = 1; seed <= 30; seed++) {
      const g = createGame(seed)
      render(g, f)
      startMatch(g)
      render(g, f)
      expect(Math.min(...g.ground)).toBeGreaterThanOrEqual(GROUND_MIN_Y)
    }
  })
})
