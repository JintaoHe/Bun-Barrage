// Draws the image part of the display: the static scene only (starry sky,
// hills, the heroes' bodies). The title shows the next match's field, so the
// picture changes only when a new field is made (on the way back to the
// title); starting a match and playing it send no image at all. Everything that moves or reacts (faces, launchers,
// shell, blasts) is text, drawn by fx.ts on top.
import { HEART } from './art'
import { W, H, HERO_X, CELL_W, CELL_H, FX_Y, FEET_Y, BAO_SCALE, NORI_SCALE } from './constants'
import { Frame } from './gfx'
import { type Game, PLAYER, CPU } from './game'
import { makeRng } from './world'
import { bodyPose, drawBao, drawNori } from './critter'
import type { Cell } from './fx'

export const NORI_SX = 1.3
export const NORI_SY = 1.22

export function render(g: Game, f: Frame): void {
  f.clear(0)
  drawSky(f)
  // Title and match share one picture (the next match's field), so pressing
  // start sends no image; the title's logo and hints are text.
  drawGround(f, g.ground)
  drawBodies(f)
}

// ---------------------------------------------------------------------------
// Sky: identical on every screen, so the top two tiles are sent only once.
// Kept below the HUD lines (y < 72) so text stays readable.
// ---------------------------------------------------------------------------
// Moon in the top-right corner: clear of the title logo (text rows 0-1) and
// of both heroes' crosshair arcs.
const MOON = [532, 96] as const

const STARS = (() => {
  const rng = makeRng(20260925)
  const out: { x: number; y: number; kind: number }[] = []
  while (out.length < 34) {
    const x = 6 + Math.floor(rng() * (W - 12))
    const y = 78 + Math.floor(rng() * 150)
    if (Math.hypot(x - MOON[0], y - MOON[1]) < 24) continue // keep the moon clear
    out.push({ x, y, kind: rng() < 0.18 ? 2 : rng() < 0.45 ? 1 : 0 })
  }
  return out
})()

function drawSky(f: Frame): void {
  // A few stars also peek out between the HUD lines
  for (const [x, y] of [[190, 12], [383, 26], [248, 58], [566, 50]]) f.set(x, y, 5)
  for (const s of STARS) {
    if (s.kind === 2) {
      // twinkle: small cross
      f.set(s.x, s.y, 12)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) f.set(s.x + dx, s.y + dy, 5)
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) f.set(s.x + dx, s.y + dy, 2)
    } else f.set(s.x, s.y, s.kind ? 8 : 4)
  }
  // Crescent moon with a soft halo
  const [mx, my] = MOON
  for (let y = -16; y <= 16; y++)
    for (let x = -16; x <= 16; x++) {
      const d = Math.hypot(x, y)
      const cut = Math.hypot(x - 5, y - 3)
      if (d <= 10 && cut > 8.5) f.set(mx + x, my + y, d > 9 || cut < 9.6 ? 13 : 9)
      else if (d > 12.5 && d <= 13.5 && x < 2) f.set(mx + x, my + y, 1)
    }
  // Two lazy clouds at the edges (clear of the crosshair arcs)
  for (const [cx, cy, w] of [[40, 96, 30], [300, 136, 34]] as const) {
    for (let x = -w; x <= w; x++) {
      const t = x / w
      const top = cy - Math.round(7 * Math.sqrt(Math.max(0, 1 - t * t)) + 3 * Math.max(0, Math.cos(t * 7)))
      f.set(cx + x, top, 3)
      if ((cx + x) % 3 === 0) f.set(cx + x, cy + 1, 2)
    }
  }
}

// ---------------------------------------------------------------------------
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000

/** Faint distant range behind the play field (dotted), for depth. */
function drawFarHills(f: Frame, ground: Float32Array): void {
  for (let x = 0; x < W; x += 2) {
    const y = Math.round(206 - 22 * Math.sin(x * 0.011 + 0.6) - 10 * Math.sin(x * 0.031 + 2) - 6 * Math.sin(x * 0.07))
    if (y < ground[x] - 8) f.set(x, y, 2)
  }
}

/**
 * Line-art hills: one crisp bright contour, a soft second line under it, and
 * a speckle texture that fades out with depth. No big lit areas: on the
 * lenses those read as a heavy green slab.
 */
function drawGround(f: Frame, ground: Float32Array): void {
  drawFarHills(f, ground)
  for (let x = 0; x < W; x++) {
    const top = Math.round(ground[x])
    for (let y = top; y < H; y++) f.set(x, y, 0) // hide stars behind the hills
    f.set(x, top, 14)
    f.set(x, top + 1, 5)
    // strata: a dashed line following the contour
    if (x % 3 !== 0) f.set(x, top + 7 + Math.round(2 * Math.sin(x * 0.045)), 3)
    if (x % 5 < 2) f.set(x, top + 19 + Math.round(3 * Math.sin(x * 0.03 + 1)), 2)
    for (let y = top + 3; y < H; y++) {
      const d = y - top
      if (hash(x, y) < 0.22 * Math.exp(-d / 12)) f.set(x, y, d < 10 ? 4 : 2)
    }
  }
  // steep slopes: keep the contour unbroken
  for (let x = 1; x < W; x++) {
    const a = Math.round(ground[x - 1])
    const b = Math.round(ground[x])
    for (let y = Math.min(a, b) + 1; y < Math.max(a, b); y++) f.set(a < b ? x : x - 1, y, 14)
  }
  // grass tufts and tiny flowers (not under the heroes)
  for (let x = 10; x < W - 8; x += 19 + ((x * 7) % 13)) {
    if (Math.abs(x - HERO_X[0]) < 44 || Math.abs(x - HERO_X[1]) < 50) continue
    const y = Math.round(ground[x])
    if (x % 3 === 0) {
      // flower: stem + 4 petals
      f.set(x, y - 1, 8); f.set(x, y - 2, 8); f.set(x, y - 3, 8)
      f.set(x, y - 5, 15); f.set(x - 1, y - 5, 7); f.set(x + 1, y - 5, 7); f.set(x, y - 6, 7); f.set(x, y - 4, 7)
    } else {
      // grass: three blades
      f.set(x - 2, y - 1, 9); f.set(x - 3, y - 2, 7)
      f.set(x, y - 1, 11); f.set(x, y - 2, 11); f.set(x + 1, y - 3, 7)
      f.set(x + 2, y - 1, 9); f.set(x + 3, y - 2, 7)
    }
  }
}

/** Bodies only (outline + dim fill). Faces and launchers are text (fx.ts). */
function drawBodies(f: Frame): void {
  drawBao(f, HERO_X[PLAYER], FEET_Y + 1, BAO_SCALE, bodyPose(1))
  drawNori(f, HERO_X[CPU], FEET_Y + 1, NORI_SCALE, bodyPose(-1, NORI_SX, NORI_SY))
}

// ---------------------------------------------------------------------------
// Browser preview only: paint the text layers approximately, so the phone
// page shows what the glasses show (on the glasses these are real text).
// ---------------------------------------------------------------------------
export function paintCells(f: Frame, cells: Cell[]): void {
  for (const cl of cells) {
    const x = cl.c * CELL_W + CELL_W / 2
    const y = FX_Y + cl.r * CELL_H + CELL_H / 2
    glyph(f, x, y, cl.ch)
  }
}

function glyph(f: Frame, x: number, y: number, ch: string): void {
  switch (ch) {
    case '●': f.disc(x, y, 6, 15); break
    case '○': f.ring(x, y, 6, 15); break
    case '◎': f.ring(x, y, 7, 15); f.ring(x, y, 4, 15); break
    case '・': f.disc(x, y, 1.5, 15); break
    case '★': starShape(f, x, y, true); break
    case '☆': starShape(f, x, y, false); break
    case '＊': for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 4; f.line(x - Math.cos(a) * 6, y - Math.sin(a) * 6, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 15) } break
    case '♥': f.sprite(HEART, Math.round(x) - 3, Math.round(y) - 3); break
    case '◐': f.disc(x, y, 7, 15); f.disc(x + 3, y, 5, 0); f.ring(x, y, 7, 15); break
    case '▲': f.line(x - 5, y + 4, x, y - 5, 15); f.line(x, y - 5, x + 5, y + 4, 15); f.hline(x - 5, x + 5, y + 4, 15); break
    case '　': break
    default: {
      // fullwidth letters / digits / punctuation -> pixel font
      const code = ch.charCodeAt(0)
      const ascii = code >= 0xff01 && code <= 0xff5e ? String.fromCharCode(code - 0xfee0) : ch
      f.textCentered(ascii, x, y - 5, 15, 2)
    }
  }
}

function starShape(f: Frame, x: number, y: number, filled: boolean): void {
  const pts: [number, number][] = []
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const r = k % 2 ? 3 : 7
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r])
  }
  for (let k = 0; k < 10; k++) f.line(pts[k][0], pts[k][1], pts[(k + 1) % 10][0], pts[(k + 1) % 10][1], 15)
  if (filled) f.disc(x, y, 3, 15)
}
