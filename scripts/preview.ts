// Renders sample frames to PNG (green-tinted, 3x) for eyeballing the art.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { Frame } from '../src/game/gfx'
import { render, paintCells } from '../src/game/render'
import { fxCells } from '../src/game/fx'
import { hudTexts } from '../src/app/hud'
import { createGame, startMatch, dispatch, update, type Game } from '../src/game/game'

const S = 3
function png(f: Frame, path: string) {
  const w = f.w * S, h = f.h * S
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const v = [0, 96, 131, 157, 179, 197, 214, 230, 244, 255, 255, 255, 255, 255, 255, 255][f.px[Math.floor(y / S) * f.w + Math.floor(x / S)]] / 255
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = Math.round(v * 60); raw[o + 1] = Math.round(v * 255); raw[o + 2] = Math.round(v * 90)
    }
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

mkdirSync('preview', { recursive: true })
const f = new Frame()
let clock = 0
const hudPixels = (g: Game) => {
  const t = hudTexts(g)
  const ascii = (s: string) => s.replace(/♥/g, '*').replace(/♡/g, '.').replace(/■/g, '#').replace(/□/g, '-').replace(/▶/g, '>').replace(/◀/g, '<')
  f.text(ascii(t.hudL), 4, 10, 15, 2); f.text(ascii(t.wind), 200, 10, 15, 2); f.text(ascii(t.hudR), 390, 10, 15, 2)
  f.text(ascii(t.info), 4, 46, 15, 2); f.text(ascii(t.msg), 254, 46, 15, 2)
}
const shot = (g: Game, name: string) => { render(g, f); paintCells(f, fxCells(g, clock)); hudPixels(g); png(f, `preview/${name}.png`) }
const run = (g: Game, sec: number, until?: (g: Game) => boolean) => { for (let t = 0; t < sec; t += 1 / 60) { update(g, 1 / 60); clock += 1 / 60; if (until?.(g)) return } }
const fireAt = (g: Game, angle: number, power: number) => { g.angle[0] = angle; dispatch(g, 'chargeStart'); g.power[0] = power; dispatch(g, 'chargeEnd') }

const g = createGame(11, { wins: 3, losses: 1 })
shot(g, '1-title')
startMatch(g)
run(g, 0.3)
shot(g, '2-banner')
run(g, 1.0)
for (let i = 0; i < 4; i++) dispatch(g, 'scrollUp')
shot(g, '3-aim')
dispatch(g, 'chargeStart')
run(g, 0.9)
shot(g, '4-charging')
g.power[0] = 70
dispatch(g, 'chargeEnd')
run(g, 0.08)
shot(g, '5-launch')
run(g, 0.6)
shot(g, '6-flight')
run(g, 10, (g) => g.phase === 'explode')
run(g, 0.2)
shot(g, '7-explode')
run(g, 0.5)
shot(g, '8-react')
run(g, 3, (g) => g.phase === 'cpuAim')
run(g, 0.5)
shot(g, '9-cpu-think')
run(g, 3, (g) => g.phase === 'cpuCharge')
run(g, 0.4)
shot(g, '10-cpu-charge')
import { bestAim } from '../src/game/world'
let guard = 0, hitShot = false
while (g.screen === 'play' && guard++ < 20000) {
  if (g.phase === 'aim') { const a = bestAim(g.ground, g.critters, 0, 1, g.wind); fireAt(g, a.angle, a.power) }
  update(g, 1 / 60); clock += 1 / 60
  if (!hitShot && g.anim[1].hit > 0.25 && g.hp[1] > 0) { shot(g, '11-hit'); hitShot = true }
}
run(g, 0.4)
shot(g, '12-result')
console.log('done', g.screen, g.winner, g.hp)
