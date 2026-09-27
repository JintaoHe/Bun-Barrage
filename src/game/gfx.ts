// Tiny 4-bit framebuffer. Pure TypeScript, no DOM, so it runs in tests too.
import { FONT, PIXEL } from './art'
import { W, H } from './constants'

export class Frame {
  readonly w = W
  readonly h = H
  readonly px = new Uint8Array(W * H)

  clear(level = 0): void {
    this.px.fill(level)
  }

  set(x: number, y: number, level: number): void {
    x |= 0
    y |= 0
    if (x < 0 || y < 0 || x >= W || y >= H) return
    this.px[y * W + x] = level
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0
    return this.px[(y | 0) * W + (x | 0)]
  }

  rect(x: number, y: number, w: number, h: number, level: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, level)
  }

  hline(x0: number, x1: number, y: number, level: number): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, level)
  }

  line(x0: number, y0: number, x1: number, y1: number, level: number, thick = 1): void {
    x0 = Math.round(x0)
    y0 = Math.round(y0)
    x1 = Math.round(x1)
    y1 = Math.round(y1)
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      if (thick <= 1) this.set(x0, y0, level)
      else this.rect(x0 - (thick >> 1), y0 - (thick >> 1), thick, thick, level)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
  }

  disc(cx: number, cy: number, r: number, level: number): void {
    const r2 = r * r
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++)
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++)
        if (x * x + y * y <= r2) this.set(cx + x, cy + y, level)
  }

  ring(cx: number, cy: number, r: number, level: number): void {
    const steps = Math.max(12, Math.ceil(r * 7))
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2
      this.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), level)
    }
  }

  /** Filled ellipse (axis-aligned). */
  ellipse(cx: number, cy: number, rx: number, ry: number, level: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / Math.max(0.5, rx)
        const dy = (y - cy) / Math.max(0.5, ry)
        if (dx * dx + dy * dy <= 1.0) this.set(x, y, level)
      }
  }

  /** Rounded rectangle outline (and optional fill). */
  roundRect(x: number, y: number, w: number, h: number, r: number, stroke: number, fill = -1): void {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const cx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0
        const cy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0
        const d = Math.hypot(cx, cy)
        if (cx && cy && d > r + 0.3) continue
        const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1 || (cx && cy && d > r - 0.7)
        if (edge) this.set(x + i, y + j, stroke)
        else if (fill >= 0) this.set(x + i, y + j, fill)
      }
  }

  /** Dotted line (every `gap` px). */
  dotted(x0: number, y0: number, x1: number, y1: number, level: number, gap = 3): void {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / gap))
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), level)
  }

  /** Draw a sprite given as rows of legend chars. `flip` mirrors horizontally. */
  sprite(rows: readonly string[], x: number, y: number, flip = false, dim = 0): void {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]
      for (let i = 0; i < row.length; i++) {
        const ch = flip ? row[row.length - 1 - i] : row[i]
        const lv = PIXEL[ch]
        if (lv === undefined) continue
        this.set(x + i, y + j, Math.max(0, lv - dim))
      }
    }
  }

  /** 3x5 pixel text. Returns width in pixels. */
  text(str: string, x: number, y: number, level: number, scale = 1): number {
    let cx = x
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch] ?? FONT['?']
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++)
          if (g[r][c]) this.rect(cx + c * scale, y + r * scale, scale, scale, level)
      cx += 4 * scale
    }
    return cx - x - scale
  }

  static textWidth(str: string, scale = 1): number {
    return str.length === 0 ? 0 : str.length * 4 * scale - scale
  }

  textCentered(str: string, cx: number, y: number, level: number, scale = 1): void {
    this.text(str, Math.round(cx - Frame.textWidth(str, scale) / 2), y, level, scale)
  }
}
