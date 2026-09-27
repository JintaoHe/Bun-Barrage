// The effects layer: everything that moves or reacts is drawn as characters
// on a 28 x 8 text grid (one text container), because text updates reach the
// glasses far faster than images: the heroes' faces (kaomoji inside their
// image bodies), their launchers, the aim guide, the shell, blasts, dizzy
// stars. Every glyph used here is fullwidth, so columns line up (measured:
// 20 px per cell, 27 px per line).
import { CELL_W, CELL_H, FX_COLS, FX_ROWS, FX_Y, CRITTER_H, W, FACE_ROW } from './constants'
import { type Game, type Mood, PLAYER, CPU, moodOf, AIM_BUMP_TIME } from './game'
import { aimSpot, type AimSpot } from './world'

/** A text cell; `bar` = on the half-cell-shifted layer (crosshair spots only). */
export type Cell = { r: number; c: number; ch: string; bar?: boolean }
const SP = '　' // ideographic space: exactly one cell wide

export function cellOf(x: number, y: number): { r: number; c: number } {
  return { c: Math.floor(x / CELL_W), r: Math.floor((y - FX_Y) / CELL_H) }
}

const inGrid = (r: number, c: number) => r >= 0 && r < FX_ROWS && c >= 0 && c < FX_COLS

/** Turn a string into fullwidth glyphs (ASCII -> U+FF01..). */
export function wide(s: string): string {
  return s.replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).replace(/ /g, SP)
}

/** Three-cell kaomoji per mood (all glyphs measured one cell wide). */
export const FACES: Record<Mood | 'blink' | 'charge', string> = {
  normal: 'ｏｗｏ',
  aim: 'ｏｗｏ',
  blink: '－ｗ－',
  charge: '≧ｗ≦',
  recoil: 'ｏ△ｏ',
  happy: '⌒▽⌒',
  win: '≧▽≦',
  hitX: '＞﹏＜',
  dizzy: '◎﹏◎',
  shake: '－﹏－',
  phew: 'ｏ﹏ｏ',
  taunt: 'ｏｐ－',
  ko: 'Ｘ﹏Ｘ',
}

/**
 * All effect cells for the current moment. Later cells win. `clock` is the
 * app clock; animations are quantised to 10 fps so identical frames repeat.
 */
export function fxCells(g: Game, clock: number): Cell[] {
  const t = Math.floor(clock * 10) / 10
  const out: Cell[] = []
  const put = (r: number, c: number, ch: string) => { if (inGrid(r, c)) out.push({ r, c, ch }) }
  const putWord = (r: number, c: number, word: string) => [...wide(word)].forEach((ch, k) => put(r, c + k, ch))
  const occupied = (x: number, y: number) => g.critters.some((c) => Math.abs(x - c.x) < 40 && y > c.y - CRITTER_H - 8 && y < c.y + 4)

  if (g.screen === 'title') {
    // Logo as text: the picture is the next match's field, so starting sends no image
    const twinkle = Math.floor(t * 1.5) % 2 === 0
    const logo = `${twinkle ? '★' : '☆'}　ＢＵＮ　ＢＡＲＲＡＧＥ　${twinkle ? '☆' : '★'}`
    ;[...logo].forEach((ch, k) => put(0, 6 + k, ch))
    ;[...'ＢＡＯ　♥　ＮＯＲＩ'].forEach((ch, k) => put(1, 9 + k, ch))
    drawHeroes(g, t, put, true)
    return out
  }

  // --- Shell in flight + dotted trail
  if (g.shot) {
    const seen = new Set<string>()
    g.trail.forEach((p) => {
      if (occupied(p.x, p.y)) return
      const cl = cellOf(p.x, p.y)
      const key = `${cl.r},${cl.c}`
      if (!seen.has(key)) { seen.add(key); put(cl.r, cl.c, '・') }
    })
    const cl = cellOf(g.shot.x, g.shot.y)
    if (cl.r < 0) put(0, Math.max(0, Math.min(FX_COLS - 1, cl.c)), '▲') // above the view
    else put(cl.r, cl.c, '●')
  }

  // --- Blast
  const b = g.blast
  if (b) {
    const { r, c } = cellOf(b.x, b.y)
    const ring = (rad: number, ch: string) => {
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++)
          if (Math.max(Math.abs(dr), Math.abs(dc)) === rad) put(r + dr, c + dc, ch)
    }
    if (b.kind === 'miss') {
      putWord(1, Math.max(0, Math.min(FX_COLS - 4, Math.floor(b.x / CELL_W) - 2)), 'MISS')
    } else if (b.kind === 'ground') {
      // dirt burst: flash -> ring -> debris flying up -> gone
      if (b.t < 0.12) put(r, c, '●')
      else if (b.t < 0.3) { put(r, c, '◎'); ring(1, '・') }
      else if (b.t < 0.55) { put(r, c, '○'); put(r - 1, c - 1, '※'); put(r - 1, c + 1, '※'); put(r - 2, c, '・') }
      else if (b.t < 0.8) { put(r - 2, c - 2, '・'); put(r - 3, c, '・'); put(r - 2, c + 2, '・') }
    } else {
      // direct / splash hit: star burst + BONK, then dizzy stars on the victim
      if (b.t < 0.12) put(r, c, '★')
      else if (b.t < 0.35) { put(r, c, '◎'); ring(1, '★') }
      else if (b.t < 0.6) { ring(1, '☆'); ring(2, '・') }
    }
  }

  // --- Per-critter reactions
  for (const i of [PLAYER, CPU] as const) {
    const cr = g.critters[i]
    const head = cellOf(cr.x, cr.y - CRITTER_H - 6)
    const mood = moodOf(g, i)
    const a = g.anim[i]
    if (mood === 'dizzy' || mood === 'hitX' || mood === 'ko') {
      // three stars circling over the head (a flattened ring, back and forth)
      const orbit = [[1, -2], [0, -1], [0, 0], [0, 1], [1, 2], [0, 1], [0, 0], [0, -1]]
      const step = Math.floor(t * 6)
      for (let k = 0; k < 3; k++) {
        const [dr, dc] = orbit[(step + k * 3) % orbit.length]
        put(head.r + dr, head.c + dc, k === 0 ? '★' : '☆')
      }
    }
    if (a.hit >= 0 && a.hit < 1.2) {
      const dmg = g.blast?.dmg[i] ?? 0
      // beside the head on the outer side, floating up (away from BONK!)
      if (dmg) putWord(head.r - (a.hit > 0.6 ? 1 : 0), cr.facing > 0 ? Math.max(0, head.c - 3) : Math.min(FX_COLS - 2, head.c + 2), `-${dmg}`)
    }
    if (mood === 'shake') { put(head.r, head.c - 2, '＃'); put(head.r, head.c + 2, '＃') }
    if (mood === 'happy' || mood === 'win') {
      const up = Math.floor(((a.hop % 1.4) / 1.4) * 3)
      put(head.r - up, head.c + (i === PLAYER ? 1 : -1), '♥')
    }
    if (mood === 'taunt') putWord(head.r - 1, Math.min(FX_COLS - 4, head.c + (i === CPU ? -4 : 1)), 'HEHE')
    if (mood === 'phew') { put(head.r, head.c + (cr.facing > 0 ? -2 : 2), '！'); put(FACE_ROW - 1, head.c - cr.facing, '〃') }
    if (mood === 'ko' && !(a.hit >= 0 && a.hit < 1.2)) put(head.r - 2, head.c, '〇') // after the damage number
  }

  // --- BONK! / POW! over everything but the faces
  if (b && b.kind === 'hit' && b.t > 0.12 && b.t < 1.4) {
    const { r, c } = cellOf(b.x, b.y)
    const word = b.dmg[0] + b.dmg[1] >= 2 ? 'BONK!' : 'POW!'
    putWord(Math.max(0, r - 4), Math.max(0, Math.min(FX_COLS - word.length, c - 2)), word)
  }

  // --- CPU thinking / charging marks
  if (g.screen === 'play' && g.turn === CPU) {
    const h = cellOf(g.critters[CPU].x, g.critters[CPU].y - CRITTER_H - 6)
    if (g.phase === 'cpuAim') put(h.r - 1, h.c - 1, Math.floor(t * 3) % 2 ? '？' : SP)
    if (g.phase === 'cpuCharge') put(h.r - 1, h.c - 1, '！')
  }

  // --- Win confetti
  if (g.screen === 'result' && g.winner === PLAYER) {
    const step = Math.floor(t * 5)
    for (let k = 0; k < 9; k++) {
      const c = (k * 7 + 3) % FX_COLS
      const r = (step + k * 3) % FX_ROWS
      put(r, c, ['＊', '♥', '・', '☆'][k % 4])
    }
  }

  // --- Crosshair: shows the aim; every 5° step moves it to its own spot
  for (const i of [PLAYER, CPU] as const) {
    const live = g.screen === 'play' && g.turn === i &&
      (i === PLAYER ? g.phase === 'aim' || g.phase === 'banner' : g.phase === 'cpuAim' || g.phase === 'cpuCharge')
    if (!live) continue
    const cr = g.critters[i]
    const spot = aimSpot(cr, g.angle[i])
    const m = g.aimMove[i]
    // a faint dot where it just was, so the eye catches the direction of travel
    if (m.t >= 0) {
      const old = aimSpot(cr, m.from)
      if (old.r !== spot.r || old.c !== spot.c || old.bar !== spot.bar) out.push({ ...cellAt(old), ch: '・' })
    }
    // pushing past 10° / 80°: the crosshair blinks ("can't go further")
    const bump = g.aimBump[i]
    const hidden = bump >= 0 && bump < AIM_BUMP_TIME && Math.floor(bump / 0.08) % 2 === 0
    if (!hidden) out.push({ ...cellAt(spot), ch: '⊙' })
  }

  // --- Heroes last, so no effect ever covers a face
  drawHeroes(g, t, put, false)
  return out
}

const cellAt = (s: AimSpot): Omit<Cell, 'ch'> => ({ r: s.r, c: s.c, bar: s.bar })

/** Faces (kaomoji inside the image bodies). */
function drawHeroes(g: Game, t: number, put: (r: number, c: number, ch: string) => void, title: boolean): void {
  for (const i of [PLAYER, CPU] as const) {
    const cr = g.critters[i]
    const mood: Mood = title ? 'normal' : moodOf(g, i)
    const col = Math.floor(cr.x / CELL_W)
    let face = FACES[mood]
    if (mood === 'normal') {
      // idle blink: 0.2 s every ~3.4 s, the two heroes out of step
      if ((t + i * 1.3) % 3.4 < 0.2) face = FACES.blink
      if (!title && ((i === PLAYER && g.charging) || (i === CPU && g.phase === 'cpuCharge'))) face = FACES.charge
    }
    ;[...face].forEach((ch, k) => put(FACE_ROW, col - 1 + k, ch))
  }
}

/** Compose cells into the text container content (rows of 28 cells). */
export function fxText(cells: Cell[]): string {
  const grid = Array.from({ length: FX_ROWS }, () => Array<string>(FX_COLS).fill(SP))
  for (const cl of cells) if (!cl.bar && cl.r >= 0 && cl.r < FX_ROWS && cl.c >= 0 && cl.c < FX_COLS) grid[cl.r][cl.c] = cl.ch
  // Trim trailing spaces per row (less to send) and trailing empty rows
  const rows = grid.map((row) => row.join('').replace(/　+$/, ''))
  while (rows.length && rows[rows.length - 1] === '') rows.pop()
  return rows.join('\n') || ' '
}

export const FX_PIXEL_CENTER = (r: number, c: number) => ({ x: c * CELL_W + CELL_W / 2, y: FX_Y + r * CELL_H + CELL_H / 2 })
export const FX_WIDTH = W

/** Content of the half-cell-shifted layer (crosshair spots that fall between grid cells). */
export function barText(cells: Cell[]): string {
  const lines: string[][] = []
  for (const cl of cells) {
    if (!cl.bar || cl.r < 0 || cl.c < 0) continue
    while (lines.length <= cl.r) lines.push([])
    const row = lines[cl.r]
    while (row.length <= cl.c) row.push(SP)
    row[cl.c] = cl.ch
  }
  return lines.map((r) => r.join('').replace(/　+$/, '')).join('\n').replace(/\n+$/, '') || ' '
}
