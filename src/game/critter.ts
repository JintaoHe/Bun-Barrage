// Procedurally drawn heroes, so they can squash, stretch, lean and emote.
// Bao = a squat steamed bun with pleats; Nori = a rice ball in a seaweed wrap.
// All shapes are original to this project.
import { Frame } from './gfx'
import { L } from './constants'

export type Eyes = 'open' | 'blink' | 'happy' | 'wince' | 'x' | 'swirl' | 'wink' | 'focus'
export type Mouth = 'smile' | 'open' | 'tongue' | 'wavy' | 'flat' | 'grin' | 'o'

export type Pose = {
  sx: number // horizontal stretch (1 = normal)
  sy: number // vertical stretch
  lean: number // px the top shifts sideways
  eyes: Eyes
  mouth: Mouth
  look: { x: number; y: number } // -1..1 pupil direction
  blush: boolean
  sweat: boolean
  facing: 1 | -1
  /** false = body only (outline + dim fill); the face is drawn as text on top */
  face: boolean
}

export const basePose = (facing: 1 | -1): Pose => ({
  sx: 1, sy: 1, lean: 0, eyes: 'open', mouth: 'smile', look: { x: facing * 0.6, y: 0 }, blush: true, sweat: false, facing, face: true,
})

/** Body-only pose used on the glasses: the face is text, so the fill stays dark enough to read it. */
export const bodyPose = (facing: 1 | -1, sx = 1, sy = 1): Pose => ({ ...basePose(facing), sx, sy, face: false })

// Grey levels for a full-colour body vs. a dim "backdrop" body behind text
const tone = (p: Pose) => (p.face ? { face: true, body: BODY, shade: SHADE, pleat: 3, knot: 11, hi: 9, rice: 4 } : { face: false, body: 0, shade: 0, pleat: 5, knot: 12, hi: 7, rice: 3 })

const BODY = 6
const SHADE = 4
const EDGE = 13
const INK = 0

/** Local mask painter: fill shape, then outline where it meets the outside. */
function paintShape(
  f: Frame, x0: number, y0: number, w: number, h: number,
  inside: (x: number, y: number) => boolean,
  shade: (x: number, y: number) => number,
  rim = 0,
): (x: number, y: number) => boolean {
  const m = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = inside(x0 + i, y0 + j) ? 1 : 0
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : m[j * w + i])
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!at(i, j)) continue
      const edge = !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1)
      const nearEdge = rim && (!at(i - 3, j) || !at(i + 3, j) || !at(i, j - 3) || !at(i, j + 3))
      const v = edge ? EDGE : nearEdge && !(!at(i - 2, j) || !at(i + 2, j) || !at(i, j - 2) || !at(i, j + 2)) ? rim : shade(x0 + i, y0 + j)
      if (v) f.set(x0 + i, y0 + j, v)
    }
  return (x, y) => at(Math.round(x) - x0, Math.round(y) - y0) === 1 && at(Math.round(x) - x0 - 1, Math.round(y) - y0) === 1 && at(Math.round(x) - x0 + 1, Math.round(y) - y0) === 1
}

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------
function eye(f: Frame, x: number, y: number, s: number, kind: Eyes, look: { x: number; y: number }, right: boolean): void {
  const rx = 1.5 * s
  const ry = 2.1 * s
  const lx = Math.round(look.x * s)
  const ly = Math.round(look.y * s)
  switch (kind) {
    case 'open':
    case 'focus': {
      f.ellipse(x + lx, y + ly, rx, kind === 'focus' ? ry * 0.85 : ry, INK)
      // kawaii shine
      const shx = Math.round(x + lx - rx * 0.35)
      const shy = Math.round(y + ly - ry * 0.4)
      f.set(shx, shy, L.BRIGHT)
      if (s >= 1.2) { f.set(shx, shy + 1, L.HIGH); f.set(shx - 1 + (s >= 2 ? 1 : 1), shy, L.HIGH) }
      if (s >= 2) f.set(Math.round(x + lx + rx * 0.4), Math.round(y + ly + ry * 0.45), L.HIGH)
      break
    }
    case 'blink':
      f.line(x - rx - 0.5, y, x + rx + 0.5, y, INK)
      f.set(x - rx - 0.5, y - 1, INK); f.set(x + rx + 0.5, y - 1, INK)
      break
    case 'happy': // ^
      f.line(x - rx - 0.5, y + 1, x, y - 1, INK)
      f.line(x, y - 1, x + rx + 0.5, y + 1, INK)
      break
    case 'wink':
      if (right) eye(f, x, y, s, 'open', look, right)
      else { f.line(x - rx - 0.5, y, x + rx + 0.5, y, INK); f.set(x + rx + 0.5, y - 1, INK) }
      break
    case 'wince': { // > <
      const d = right ? -1 : 1
      f.line(x - d * rx, y - ry * 0.8, x + d * rx, y, INK)
      f.line(x + d * rx, y, x - d * rx, y + ry * 0.8, INK)
      break
    }
    case 'x':
      f.line(x - rx, y - rx, x + rx, y + rx, INK)
      f.line(x - rx, y + rx, x + rx, y - rx, INK)
      break
    case 'swirl':
      f.ring(x, y, rx + 0.4, INK)
      f.set(x, y, INK)
      break
  }
}

function mouth(f: Frame, x: number, y: number, s: number, kind: Mouth): void {
  switch (kind) {
    case 'smile': // cat mouth "w"
      f.set(x - 2, y, INK); f.set(x - 1, y + 1, INK); f.set(x, y, INK); f.set(x + 1, y + 1, INK); f.set(x + 2, y, INK)
      break
    case 'grin':
      f.line(x - 3, y, x + 3, y, INK); f.line(x - 2, y + 1, x + 2, y + 1, INK); f.set(x, y + 2, INK)
      break
    case 'open':
      f.ellipse(x, y + 1, 1.8 * s, 1.6 * s, INK)
      f.hline(x - 1, x + 1, Math.round(y + 1 + s), 9)
      break
    case 'o':
      f.ring(x, y + 1, 1.2 * s, INK)
      break
    case 'tongue':
      f.set(x - 2, y, INK); f.set(x - 1, y + 1, INK); f.set(x, y, INK); f.set(x + 1, y + 1, INK); f.set(x + 2, y, INK)
      f.rect(x - 1, y + 2, 3, 2, 10); f.set(x, y + 4, 10); f.set(x, y + 2, INK)
      break
    case 'wavy':
      f.set(x - 2, y + 1, INK); f.set(x - 1, y, INK); f.set(x, y + 1, INK); f.set(x + 1, y, INK); f.set(x + 2, y + 1, INK)
      break
    case 'flat':
      f.line(x - 2, y + 1, x + 2, y + 1, INK)
      break
  }
}

function blush(f: Frame, x: number, y: number): void {
  // manga-style "///"
  for (let i = 0; i < 3; i++) f.line(x - 2 + i * 2, y + 1, x - 1 + i * 2, y, 12)
}

function sweat(f: Frame, x: number, y: number): void {
  f.set(x, y - 2, EDGE)
  f.set(x - 1, y - 1, EDGE); f.set(x + 1, y - 1, EDGE)
  f.set(x - 1, y, EDGE); f.set(x + 1, y, EDGE)
  f.set(x, y + 1, EDGE)
  f.set(x, y - 1, 2); f.set(x, y, 2)
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------
/** Steamed bun. (cx, feet) = bottom centre. s = scale (1 on the field). */
export function drawBao(f: Frame, cx: number, feet: number, s: number, p: Pose): void {
  const a = 15 * s * p.sx
  const h = 22 * s * p.sy
  const top = feet - h
  const halfW = (y: number) => {
    const rel = (feet - y) / h // 0 bottom .. 1 top
    if (rel < 0 || rel > 1) return -1
    const dome = Math.pow(Math.max(0, 1 - Math.pow(rel, 2.3)), 0.55)
    const base = rel < 0.14 ? 0.82 + 0.18 * Math.sqrt(rel / 0.14) : 1
    return a * dome * base
  }
  const centreAt = (y: number) => cx + p.lean * ((feet - y) / h)
  const inside = (x: number, y: number) => {
    const w = halfW(y)
    return w >= 0 && Math.abs(x - centreAt(y)) <= w
  }
  const x0 = Math.floor(cx - a - Math.abs(p.lean) - 2)
  const y0 = Math.floor(top - 2)
  const k = tone(p)
  const shade = (x: number, y: number) => {
    const rel = (feet - y) / h
    const u = (x - centreAt(y)) / a
    if (rel < 0.12) return k.shade
    if (u > 0.55 && rel < 0.5) return k.face ? SHADE + 1 : k.body
    return k.body
  }
  const interior = paintShape(f, x0, y0, Math.ceil(2 * a + 2 * Math.abs(p.lean) + 5), Math.ceil(h + 5), inside, shade, p.face ? 0 : 3)

  // Pleats swirling into the knot on top
  const kx = centreAt(top + 1)
  for (const u of [-0.62, -0.3, 0.3, 0.62]) {
    const ey = top + h * 0.34
    const ex = centreAt(ey) + u * halfW(ey)
    const n = p.face ? 12 : 40
    for (let q = 2; q <= n; q++) {
      const t = 0.15 + ((1 - 0.15) * q) / n
      const px = kx + (ex - kx) * t + Math.sin(t * Math.PI) * u * 2 * s
      const py = top + 1 + (ey - top - 1) * t * (p.face ? 1 : 0.8)
      if (interior(px, py)) f.set(px, py, k.pleat)
    }
  }
  if (!p.face) {
    // line-art: little knot, a glint arc, and a soft shadow on the ground
    f.ellipse(kx, top + 1.5 * s, 2.2 * s, 1.2 * s, 0)
    f.ring(kx, top + 1.5 * s, 2 * s, k.knot)
    for (let q = 0; q <= 14; q++) {
      const t = 3.3 + (q / 14) * 1.0
      f.set(centreAt(top + h * 0.4) + Math.cos(t) * a * 0.62, top + h * 0.55 + Math.sin(t) * h * 0.38, k.hi)
    }
    return
  }
  f.ellipse(kx, top + 1.2 * s, 2.2 * s, 1.3 * s, k.knot)
  f.set(kx, top, L.BRIGHT)
  // Soft highlight
  f.ellipse(centreAt(top + h * 0.35) - a * 0.5, top + h * 0.38, 1.4 * s, 1 * s, k.hi)

  // Face
  const fy = feet - h * 0.36
  const fx = centreAt(fy) + p.facing * 1.5 * s
  const ex = 5.5 * s * p.sx
  eye(f, Math.round(fx - ex), Math.round(fy), s, p.eyes, p.look, false)
  eye(f, Math.round(fx + ex), Math.round(fy), s, p.eyes, p.look, true)
  mouth(f, Math.round(fx), Math.round(fy + 3.2 * s), s, p.mouth)
  if (p.blush) {
    blush(f, Math.round(fx - ex - 3.5 * s), Math.round(fy + 2.8 * s))
    blush(f, Math.round(fx + ex + 3.5 * s), Math.round(fy + 2.8 * s))
  }
  if (p.sweat) sweat(f, Math.round(centreAt(top) + a * 0.75 * -p.facing), Math.round(top + h * 0.25))
}

// Signed distance to a triangle (Inigo Quilez)
function sdTri(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const e0x = bx - ax, e0y = by - ay, e1x = cx - bx, e1y = cy - by, e2x = ax - cx, e2y = ay - cy
  const v0x = px - ax, v0y = py - ay, v1x = px - bx, v1y = py - by, v2x = px - cx, v2y = py - cy
  const cl = (v: number) => Math.max(0, Math.min(1, v))
  const t0 = cl((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y))
  const t1 = cl((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y))
  const t2 = cl((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y))
  const pq0x = v0x - e0x * t0, pq0y = v0y - e0y * t0
  const pq1x = v1x - e1x * t1, pq1y = v1y - e1y * t1
  const pq2x = v2x - e2x * t2, pq2y = v2y - e2y * t2
  const sgn = Math.sign(e0x * e2y - e0y * e2x)
  const d0 = [pq0x * pq0x + pq0y * pq0y, sgn * (v0x * e0y - v0y * e0x)]
  const d1 = [pq1x * pq1x + pq1y * pq1y, sgn * (v1x * e1y - v1y * e1x)]
  const d2 = [pq2x * pq2x + pq2y * pq2y, sgn * (v2x * e2y - v2y * e2x)]
  const dmin = Math.min(d0[0], d1[0], d2[0])
  const smin = Math.min(d0[1], d1[1], d2[1])
  return -Math.sqrt(dmin) * Math.sign(smin)
}

/** Rice ball. (cx, feet) = bottom centre. */
export function drawNori(f: Frame, cx: number, feet: number, s: number, p: Pose): void {
  const a = 16 * s * p.sx
  const h = 26 * s * p.sy
  const r = 6 * s
  const top = feet - h
  const tx = (y: number) => cx + p.lean * ((feet - y) / h)
  // inset triangle, then dilate by r => rounded corners
  const ax = cx + p.lean - 0, ay = top + r * 1.9
  const bx = cx - a + r * 1.5, by = feet - r
  const qx = cx + a - r * 1.5, qy = feet - r
  const inside = (x: number, y: number) => sdTri(x, y, ax, ay, bx, by, qx, qy) <= r
  const k = tone(p)
  // Body-only mode: a thin seaweed strip along the bottom keeps the face area clear
  const bandTop = p.face ? feet - h * 0.3 : feet - h * 0.13
  const bandU = p.face ? 0.34 : 0.62
  const shade = (x: number, y: number) => {
    const u = (x - tx(y)) / a
    if (y >= bandTop && Math.abs(u) < bandU) {
      if (p.face) return Math.abs(u) > 0.28 ? 3 : 1 // seaweed
      const yy = Math.round(y), xx = Math.round(x)
      return yy === Math.round(bandTop) ? 9 : (xx + yy) % 4 === 0 ? 4 : 0 // hatched seaweed strip
    }
    if (y > feet - 3 * s) return k.shade
    // rice grain texture
    const hsh = ((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663)) >>> 0
    if (hsh % 29 === 0) return k.rice
    return p.face ? BODY + 1 : k.body
  }
  paintShape(f, Math.floor(cx - a - Math.abs(p.lean) - 2), Math.floor(top - 2), Math.ceil(2 * a + 2 * Math.abs(p.lean) + 5), Math.ceil(h + 5), inside, shade, p.face ? 0 : 3)
  if (!p.face) {
    // glint arc near the rounded top
    for (let q = 0; q <= 10; q++) {
      const t = 3.6 + (q / 10) * 0.9
      f.set(tx(top + h * 0.4) + Math.cos(t) * a * 0.32, top + h * 0.42 + Math.sin(t) * h * 0.2, k.hi)
    }
    return
  }
  // Highlight
  f.ellipse(tx(top + h * 0.3) - a * 0.18, top + h * 0.32, 1.2 * s, 0.9 * s, p.face ? 11 : k.hi)
  // Seaweed sheen
  f.line(tx(bandTop) - a * 0.18, bandTop + 2 * s, tx(bandTop) - a * 0.18, feet - 3 * s, 2)

  const fy = feet - h * 0.52
  const fx = tx(fy) + p.facing * 1.2 * s
  const ex = 4.5 * s * p.sx
  eye(f, Math.round(fx - ex), Math.round(fy), s, p.eyes, p.look, false)
  eye(f, Math.round(fx + ex), Math.round(fy), s, p.eyes, p.look, true)
  mouth(f, Math.round(fx), Math.round(fy + 3 * s), s, p.mouth)
  if (p.blush) {
    blush(f, Math.round(fx - ex - 3 * s), Math.round(fy + 2.6 * s))
    blush(f, Math.round(fx + ex + 3 * s), Math.round(fy + 2.6 * s))
  }
  if (p.sweat) sweat(f, Math.round(tx(top) + a * 0.55 * -p.facing), Math.round(top + h * 0.35))
}

/** Bamboo pop-gun, drawn behind the body. Returns the muzzle point. */
export function drawLauncher(f: Frame, px: number, py: number, angleDeg: number, facing: 1 | -1, len: number, kick = 0): void {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.cos(a) * facing
  const dy = -Math.sin(a)
  const nx = -dy
  const ny = dx
  px -= dx * kick
  py -= dy * kick
  for (let t = -2; t <= len; t += 0.5) {
    for (let w = -2.5; w <= 2.5; w += 0.5) {
      const x = px + dx * t + nx * w
      const y = py + dy * t + ny * w
      const edge = Math.abs(w) >= 2.2
      const node = Math.abs(t - len * 0.35) < 0.6 || Math.abs(t - len * 0.72) < 0.6
      let lv = edge ? 12 : node ? 11 : 5
      if (t > len - 1.2) lv = Math.abs(w) < 1.2 ? 1 : 14 // bore + rim
      f.set(Math.round(x), Math.round(y), lv)
    }
  }
}

/** Tiny paw holding the launcher (drawn in front of the body). */
export function drawPaw(f: Frame, px: number, py: number, angleDeg: number, facing: 1 | -1, kick = 0): void {
  const a = (angleDeg * Math.PI) / 180
  const x = px + Math.cos(a) * facing * (5 - kick)
  const y = py - Math.sin(a) * (5 - kick)
  f.ellipse(x, y + 1, 2.2, 1.8, EDGE)
  f.ellipse(x, y + 1, 1.2, 0.8, 9)
}
