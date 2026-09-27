import { createGame, dispatch, update, type Action, type Effects, type Stats } from './game/game'
import { Frame } from './game/gfx'
import { render } from './game/render'
import { fxCells, fxText, barText, type Cell } from './game/fx'
import { BAR_DX, BAR_DY } from './game/world'
import { W, H, CELL_W, CELL_H, FX_Y } from './game/constants'
import { Glasses } from './app/glasses'
import { Input } from './app/input'
import { hudTexts } from './app/hud'
import { bestAim } from './game/world'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const game = createGame(Date.now(), loadLocalStats())
const frame = new Frame()
let clock = 0
let lastRender = -1

// Off-screen greyscale canvases (one per region size) used to encode PNGs
const encoders = new Map<string, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData }>()
function encoderFor(w: number, h: number) {
  const key = `${w}x${h}`
  let e = encoders.get(key)
  if (!e) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    e = { canvas, ctx, img: ctx.createImageData(w, h) }
    encoders.set(key, e)
  }
  return e
}

// Phone preview canvas (green tint, like the real display)
const preview = $<HTMLCanvasElement>('preview')
const previewCtx = preview.getContext('2d')!
const previewImg = previewCtx.createImageData(W, H)

const glasses = new Glasses({
  onAction: (a) => act(a),
  onSystemExit: () => log('Exited'),
  frame,
  encodeTile,
  log,
})
// ?latency=110 mimics real-hardware send time when testing in the simulator
glasses.latencyMs = Number(new URLSearchParams(location.search).get('latency') || 0)
glasses.debug = location.search.includes('debug')
const input = new Input((a) => act(a))
input.attachKeyboard(window)

// ---------------------------------------------------------------------------
function act(a: Action): void {
  if (glasses.bridge) glasses.deferImages(a === 'scrollUp' || a === 'scrollDown' || a === 'up' || a === 'down' ? 220 : 120)
  handle(dispatch(game, a))
  present() // react immediately, not on the next frame tick
}

function handle(fx: Effects): void {
  if (fx.exit) glasses.requestExit()
  if (fx.statsChanged) {
    saveStats(game.stats)
    log(`match over: winner=${String(game.winner)} wins=${game.stats.wins} losses=${game.stats.losses}`)
  }
}


// Brightness the Even host actually shows per grey level (measured in the
// official simulator 0.9.5), so the phone preview matches the lenses.
const HOST_CURVE = [0, 96, 131, 157, 179, 197, 214, 230, 244, 255, 255, 255, 255, 255, 255, 255]

let lastCells: Cell[] = []
let lastHud: ReturnType<typeof hudTexts> = hudTexts(game)

function present(): void {
  draw()
  if (glasses.bridge) {
    // set everything first, then send once, so the queue sees the whole frame
    glasses.setText('fx', fxText(lastCells), false)
    glasses.setText('bar', barText(lastCells), false)
    for (const k of ['hudL', 'wind', 'hudR', 'info', 'msg'] as const) glasses.setText(k, lastHud[k], false)
    glasses.kick()
  }
}

function draw(): void {
  render(game, frame)
  lastCells = fxCells(game, clock)
  lastHud = hudTexts(game)
  // Phone preview: the image layer, plus the text layers drawn with a real font
  const px = frame.px
  const d = previewImg.data
  for (let i = 0; i < px.length; i++) {
    const v = HOST_CURVE[px[i]] / 255
    d[i * 4] = v * 70
    d[i * 4 + 1] = v * 255
    d[i * 4 + 2] = v * 110
    d[i * 4 + 3] = 255
  }
  previewCtx.putImageData(previewImg, 0, 0)
  previewCtx.fillStyle = '#46ff6e'
  previewCtx.textBaseline = 'middle'
  previewCtx.textAlign = 'center'
  previewCtx.font = '18px "Noto Sans CJK SC", "PingFang SC", sans-serif'
  for (const c of lastCells) if (!c.bar) previewCtx.fillText(c.ch, c.c * CELL_W + CELL_W / 2, FX_Y + c.r * CELL_H + CELL_H / 2)
  barText(lastCells).split('\n').forEach((row, r) => [...row].forEach((ch, c) => previewCtx.fillText(ch, BAR_DX + c * CELL_W + CELL_W / 2, FX_Y + BAR_DY + r * CELL_H + CELL_H / 2)))
  previewCtx.textAlign = 'left'
  previewCtx.font = '20px -apple-system, system-ui, sans-serif'
  const rowsXY: [keyof typeof lastHud, number, number][] = [['hudL', 2, 18], ['wind', 198, 18], ['hudR', 388, 18], ['info', 2, 54], ['msg', 298, 54]]
  for (const [k, x, y] of rowsXY) previewCtx.fillText(lastHud[k], x, y)
}

async function encodeTile(px: Uint8Array, w: number, h: number): Promise<number[]> {
  const { canvas: encodeCanvas, ctx: encodeCtx, img: encodeImg } = encoderFor(w, h)
  const d = encodeImg.data
  for (let i = 0; i < px.length; i++) {
    const g = px[i] * 17
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g
    d[i * 4 + 3] = 255
  }
  encodeCtx.putImageData(encodeImg, 0, 0)
  const blob = await new Promise<Blob>((res, rej) =>
    encodeCanvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
  )
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

// ---------------------------------------------------------------------------
// Main loop: ~60 Hz simulation, ~30 Hz drawing. The glasses layer diffs the
// four tiles and re-sends only the ones that changed, one at a time.
// ---------------------------------------------------------------------------
// Debug only (?hint in the URL): log the ideal aim at the start of each of
// the player's turns, so scripted simulator runs can play a real match.
const HINTS = location.search.includes('hint')
let hintedTurn = ''
function emitHint(): void {
  const key = `${game.screen}/${game.round}/${game.turn}/${game.phase}`
  if (game.screen !== 'play' || game.turn !== 0 || game.phase !== 'aim' || key === hintedTurn) return
  hintedTurn = key
  const a = bestAim(game.ground, game.critters, 0, 1, game.wind)
  console.log(`[bun] HINT ${JSON.stringify({ angle: a.angle, power: a.power, cur: game.angle[0], wind: game.wind })}`)
}

let last = performance.now()
function tick(): void {
  const now = performance.now()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  clock += dt

  input.poll(dt)
  if (glasses.bridge) {
    game.presentHold = glasses.imagesPending
    glasses.pauseImages = game.charging || game.phase === 'cpuCharge'
    glasses.tag = `${game.screen}/${game.turn}/${game.phase}`
  }
  handle(update(game, dt))
  if (HINTS) emitHint()

  if (clock - lastRender >= 1 / 30) {
    lastRender = clock
    present()
  }
  updateStatus()
}
setInterval(tick, 16)

// ---------------------------------------------------------------------------
// Stats persistence (Even SDK storage when available, else browser storage)
// ---------------------------------------------------------------------------
function loadLocalStats(): Stats {
  try {
    const s = JSON.parse(localStorage.getItem('bunbarrage_stats') || '{}')
    return { wins: s.wins | 0, losses: s.losses | 0 }
  } catch {
    return { wins: 0, losses: 0 }
  }
}

function saveStats(s: Stats): void {
  const json = JSON.stringify(s)
  try {
    localStorage.setItem('bunbarrage_stats', json)
  } catch {
    /* ignore */
  }
  glasses.saveStats(json)
}

// ---------------------------------------------------------------------------
// Phone page: status line and log
// ---------------------------------------------------------------------------
const statusEl = $('status')
const logEl = $('log')

function log(msg: string): void {
  console.log(`[bun] ${msg}`)
  const line = document.createElement('div')
  line.textContent = msg
  logEl.prepend(line)
  while (logEl.childElementCount > 30) logEl.lastElementChild?.remove()
}

let lastStatus = ''
function updateStatus(): void {
  const g = glasses.bridge
    ? `Glasses connected · ${glasses.sentTiles} image / ${glasses.sentTexts} text updates · image avg ${glasses.avgImageMs.toFixed(0)} ms`
    : 'Preview mode (no glasses). Use the buttons below, or keys: ↑↓ angle, hold Space = fire, Enter = tap, Esc = back'
  if (g === lastStatus) return
  lastStatus = g
  statusEl.textContent = g
}


// Phone buttons (work on the glasses too: the phone page is live while playing)
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-key]')) {
  const k = btn.dataset.key as 'up' | 'down' | 'fire' | 'tap' | 'back'
  const down = (e: Event) => { e.preventDefault(); btn.classList.add('on'); btn.setPointerCapture?.((e as PointerEvent).pointerId); input.press(k, true) }
  const up = (e: Event) => {
    e.preventDefault()
    if (!btn.classList.contains('on')) return
    btn.classList.remove('on')
    input.press(k, false)
  }
  btn.addEventListener('pointerdown', down)
  btn.addEventListener('pointerup', up)
  btn.addEventListener('pointercancel', up)
  btn.addEventListener('lostpointercapture', up)
  btn.addEventListener('contextmenu', (e) => e.preventDefault())
}

// ---------------------------------------------------------------------------
async function boot(): Promise<void> {
  draw()
  const ok = await glasses.connect()
  if (ok) {
    const saved = await glasses.loadStats()
    if (saved) {
      try {
        const s = JSON.parse(saved)
        game.stats.wins = Math.max(game.stats.wins, s.wins | 0)
        game.stats.losses = Math.max(game.stats.losses, s.losses | 0)
        present()
      } catch {
        /* ignore */
      }
    }
  }
  updateStatus()
}
void boot()
