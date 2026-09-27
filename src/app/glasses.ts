// Everything that talks to the Even G2 through the Even Hub SDK.
//
// Real-hardware rules this follows (official everything-evenhub "glasses-ui"
// skill + community measurements in nickustinov/even-g2-notes):
//  * image frames cost ~0.1-2 s each over BLE and must never overlap;
//  * text updates are much faster: use text for anything that must feel instant;
//  * serialise ALL bridge calls (render + storage) and put a timeout on each;
//  * BLE is shared with input events, so an idle link = snappy taps.
// So: one queue, text before images, images only for tiles whose pixels
// actually changed, and storage writes debounced at low priority.
import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { W, H, TILE_W, TILE_H, FX_Y, FX_ROWS, CELL_H } from '../game/constants'
import { BAR_DX, BAR_DY } from '../game/world'
import type { Action } from '../game/game'
import type { Frame } from '../game/gfx'

// ---------------------------------------------------------------------------
// Page layout
//  * images (the SDK allows 4): four 288x144 tiles covering the screen. They
//    hold only the static scene (sky, hills, the heroes' bodies) and are sent
//    once per screen: nothing is re-sent during a match.
//  * text: 5 HUD lines, one 28x8 effects grid that draws everything that
//    moves or changes (faces, crosshair, shell, blasts), a half-cell-shifted
//    layer that doubles the crosshair's resolution, one input layer. (8 text + 4
//    image = 12 containers, the SDK maximum.)
// ---------------------------------------------------------------------------
type Region = { id: number; name: string; x: number; y: number; w: number; h: number }
const REGIONS: Region[] = [
  { id: 2, name: 'skyL', x: 0, y: 0, w: TILE_W, h: TILE_H },
  { id: 3, name: 'skyR', x: TILE_W, y: 0, w: TILE_W, h: TILE_H },
  { id: 4, name: 'groundL', x: 0, y: TILE_H, w: TILE_W, h: TILE_H },
  { id: 5, name: 'groundR', x: TILE_W, y: TILE_H, w: TILE_W, h: TILE_H },
]
// The ground (heroes) matters most; the sky is identical on every screen
const REGION_ORDER = [2, 3, 0, 1]

export type TextKey = 'hudL' | 'wind' | 'hudR' | 'info' | 'msg' | 'fx' | 'bar'
// Sized for the firmware font (~14 px per character, ~28 px per line) so no
// line wraps (a wrapped line would be clipped) and no scrollbar appears.
// No borders: they would stay visible even when a box is empty.
const TEXTS: Record<TextKey, { id: number; x: number; y: number; w: number; h: number; border: number }> = {
  hudL: { id: 10, x: 0, y: 0, w: 190, h: 36, border: 0 },
  wind: { id: 11, x: 196, y: 0, w: 184, h: 36, border: 0 },
  hudR: { id: 12, x: 386, y: 0, w: 190, h: 36, border: 0 },
  info: { id: 13, x: 0, y: 36, w: 292, h: 36, border: 0 },
  msg: { id: 14, x: 296, y: 36, w: 280, h: 36, border: 0 },
  fx: { id: 9, x: 0, y: FX_Y, w: W, h: FX_ROWS * CELL_H, border: 0 },
  // half-cell-shifted layer: extra crosshair spots between grid cells
  bar: { id: 15, x: BAR_DX, y: FX_Y + BAR_DY, w: W - BAR_DX, h: (FX_ROWS - 1) * CELL_H, border: 0 },
}
export type HudKey = 'hudL' | 'wind' | 'hudR' | 'info' | 'msg'
const HUD_KEYS: HudKey[] = ['hudL', 'wind', 'hudR', 'info', 'msg']
const TEXT_KEYS = Object.keys(TEXTS) as TextKey[]

function pageConfig() {
  const inputLayer = (key: string, id: number, x: number, y: number, w: number, h: number, border: number, capture: number, z: number) =>
    new TextContainerProperty({
      containerID: id, containerName: key, content: ' ',
      xPosition: x, yPosition: y, width: w, height: h,
      borderWidth: border, borderColor: 9, borderRadius: border ? 8 : 0, paddingLength: 2,
      isEventCapture: capture, zOrderIndex: z,
    })
  return {
    containerTotalNum: 1 + REGIONS.length + TEXT_KEYS.length,
    textObject: [
      // Invisible full-screen layer that receives ring / temple input
      inputLayer('input', 1, 0, 0, W, H, 0, 1, 0),
      ...TEXT_KEYS.map((k, i) => {
        const t = TEXTS[k]
        // fx grid under the HUD lines but above the images; no padding so the
        // 20 x 27 px cells land exactly on the measured grid
        return new TextContainerProperty({
          containerID: t.id, containerName: k, content: ' ',
          xPosition: t.x, yPosition: t.y, width: t.w, height: t.h,
          borderWidth: 0, paddingLength: k === 'fx' || k === 'bar' ? 0 : 2, isEventCapture: 0, zOrderIndex: k === 'fx' ? 10 : k === 'bar' ? 11 : 20 + i,
        })
      }),
    ],
    imageObject: REGIONS.map(
      (t, i) =>
        new ImageContainerProperty({
          containerID: t.id, containerName: t.name,
          xPosition: t.x, yPosition: t.y, width: t.w, height: t.h,
          zOrderIndex: 1 + i,
        }),
    ),
  }
}

export type GlassesHooks = {
  onAction: (a: Action) => void
  onSystemExit: () => void
  frame: Frame
  encodeTile: (px: Uint8Array, w: number, h: number) => Promise<number[]>
  log: (msg: string) => void
}

const CALL_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('bridge timeout')), ms))])
}

export class Glasses {
  bridge: EvenAppBridge | null = null
  private started = false
  private busy = false
  private lastSent: (Uint8Array | null)[] = REGIONS.map(() => null)
  private lastWasFx = false
  private wantText: Record<TextKey, string> = { hudL: ' ', wind: ' ', hudR: ' ', info: ' ', msg: ' ', fx: ' ', bar: ' ' }
  private sentText: Record<TextKey, string> = { hudL: ' ', wind: ' ', hudR: ' ', info: ' ', msg: ' ', fx: ' ', bar: ' ' }
  private pendingStorage: string | null = null
  private storageAt = 0
  private exitDialog = false
  private lastScroll = 0
  imageChannelDead = false

  /** Optional artificial delay per image send (ms), to mimic hardware in the simulator. */
  latencyMs = 0
  /** While true, only text is sent (e.g. while charging, so the meter stays live). */
  pauseImages = false
  private imagesAfter = 0
  /** Input just happened: let text go first and coalesce quick repeats into one image. */
  deferImages(ms = 250): void {
    this.imagesAfter = Math.max(this.imagesAfter, performance.now() + ms)
    setTimeout(() => this.kick(), ms + 5)
  }
  /** ?debug: log every bridge call */
  debug = false
  /** Label for debug logs (current game phase). */
  tag = ''
  sentTiles = 0
  sentTexts = 0
  fxSent = 0
  lastSendMs = 0
  /** Exponential average of image send time (ms); drives the adaptive detail level. */
  avgImageMs = 0

  constructor(private hooks: GlassesHooks) {}

  async connect(timeoutMs = 6000): Promise<boolean> {
    // Outside the Even app the SDK still returns a bridge, but every call fails.
    const w = window as unknown as Record<string, unknown>
    if (!('flutter_inappwebview' in w) && !location.search.includes('forceBridge')) {
      this.hooks.log('No Even host (browser preview mode)')
      return false
    }
    try {
      this.bridge = await withTimeout(waitForEvenAppBridge(), timeoutMs)
    } catch {
      this.hooks.log('No Even bridge (browser preview mode)')
      return false
    }
    this.bridge.onEvenHubEvent((e) => this.onEvent(e))
    try {
      await withTimeout(this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(pageConfig())))
    } catch (err) {
      this.hooks.log(`createStartUpPage: ${String(err)}`)
    }
    // Latch even on failure: a second create is rejected and blocks input (even-g2-notes)
    this.started = true
    this.hooks.log('Glasses page created (4 image tiles + text HUD)')
    this.kick()
    return true
  }

  /** True while an image region on the glasses is older than the current frame. */
  get imagesPending(): boolean {
    if (!this.started) return false
    return this.inFlightImage || this.dirtyRegion() >= 0
  }
  private inFlightImage = false

  /** Queue new text. Pass kick=false when setting several at once, then call kick(). */
  setText(key: TextKey, content: string, kick = true): void {
    const c = content.length ? content : ' '
    if (this.wantText[key] === c) return
    this.wantText[key] = c
    if (kick) this.kick()
  }

  saveStats(json: string): void {
    this.pendingStorage = json
    this.storageAt = performance.now() + 1500 // debounce: shares the BLE link
    this.kick()
  }

  async loadStats(): Promise<string | null> {
    if (!this.bridge) return null
    try {
      return (await withTimeout(this.bridge.getLocalStorage('bunbarrage_stats'))) || null
    } catch {
      return null
    }
  }

  /** The picture or texts may have changed: run the queue if idle. */
  kick(): void {
    if (!this.busy && this.started && this.bridge) void this.pump()
  }

  invalidate(): void {
    this.lastSent = REGIONS.map(() => null)
    for (const k of TEXT_KEYS) this.sentText[k] = '\u0000'
    this.kick()
  }

  private snapshot(i: number): Uint8Array {
    const t = REGIONS[i]
    const src = this.hooks.frame.px
    const out = new Uint8Array(t.w * t.h)
    for (let y = 0; y < t.h; y++) out.set(src.subarray((t.y + y) * W + t.x, (t.y + y) * W + t.x + t.w), y * t.w)
    return out
  }

  /** First region whose pixels differ from what the glasses show. */
  private dirtyRegion(): number {
    for (const i of REGION_ORDER) if (this.isDirty(i)) return i
    return -1
  }

  private isDirty(i: number): boolean {
    const prev = this.lastSent[i]
    if (!prev) return true
    const t = REGIONS[i]
    const src = this.hooks.frame.px
    for (let y = 0; y < t.h; y++) {
      const row = (t.y + y) * W + t.x
      for (let x = 0; x < t.w; x++) if (src[row + x] !== prev[y * t.w + x]) return true
    }
    return false
  }

  private async pump(): Promise<void> {
    const bridge = this.bridge!
    this.busy = true
    try {
      for (;;) {
        // 1) HUD text first: cheap, and it's what makes input feel instant
        const hud = HUD_KEYS.find((k) => this.wantText[k] !== this.sentText[k])
        const fxDirty = this.wantText.fx !== this.sentText.fx
        const barDirty = this.wantText.bar !== this.sentText.bar
        const region = this.pauseImages || performance.now() < this.imagesAfter ? -1 : this.dirtyRegion()
        // 2) Then the effects grid and images take turns, so a busy animation
        //    can't starve a face change and vice versa
        // The crosshair can hop between the fx grid and the half-cell layer:
        // update the layer that gains it first, so it never blinks out.
        const fxTurn = fxDirty && (region < 0 || !this.lastWasFx)
        const layer: TextKey | null =
          fxTurn && barDirty ? (this.wantText.fx.includes('⊙') ? 'fx' : 'bar') : barDirty ? 'bar' : fxTurn ? 'fx' : null
        // While the crosshair is changing layer, both layers go before the HUD
        // (the crosshair is the feedback the eye is on; the number can wait).
        const has = (k: TextKey, w: Record<TextKey, string>) => w[k].includes('⊙')
        const gains = (k: TextKey) => has(k, this.wantText) && !has(k, this.sentText)
        const loses = (k: TextKey) => !has(k, this.wantText) && has(k, this.sentText)
        const hopKey: TextKey | null =
          gains('fx') ? 'fx' : gains('bar') ? 'bar' : loses('fx') ? 'fx' : loses('bar') ? 'bar' : null
        const key: TextKey | null = hopKey ?? hud ?? layer
        if (key) {
          const content = this.wantText[key]
          if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs * 0.15)) // ~text cost on hardware
          try {
            await withTimeout(
              bridge.textContainerUpgrade(
                new TextContainerUpgrade({ containerID: TEXTS[key].id, containerName: key, contentOffset: 0, contentLength: 2000, content }),
              ),
            )
            this.sentTexts++
            if (this.debug && key !== 'fx') this.hooks.log(`text ${key} = ${content}`)
          } catch (err) {
            this.hooks.log(`text ${key}: ${String(err)}`)
          }
          this.sentText[key] = content // never spin on a failing call
          if (key === 'fx') { this.lastWasFx = true; this.fxSent++ }
          continue
        }
        if (region >= 0) {
          const i = region
          const t = REGIONS[i]
          const snap = this.snapshot(i)
          const bytes = await this.hooks.encodeTile(snap, t.w, t.h)
          const t0 = performance.now()
          this.inFlightImage = true
          if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs * ((t.w * t.h) / (TILE_W * TILE_H) * 0.4 + 0.6)))
          let ok = false
          try {
            const res = await withTimeout(
              bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: t.id, containerName: t.name, imageData: bytes })),
            )
            ok = String(res) === 'success'
            if (!ok) this.hooks.log(`image ${t.name}: ${String(res)}`)
          } catch (err) {
            this.hooks.log(`image ${t.name}: ${String(err)}`)
          }
          this.inFlightImage = false
          this.lastSendMs = performance.now() - t0
          this.avgImageMs = this.avgImageMs ? this.avgImageMs * 0.7 + this.lastSendMs * 0.3 : this.lastSendMs
          this.imageChannelDead = !ok
          this.lastSent[i] = snap // even on failure: never hammer a failing link
          this.sentTiles++
          this.lastWasFx = false
          if (this.debug) this.hooks.log(`image ${t.name} ${this.lastSendMs.toFixed(0)}ms [${this.tag}]`)
          continue
        }
        // 3) Debounced storage write, only when the link is otherwise idle
        if (this.pendingStorage && performance.now() >= this.storageAt) {
          const json = this.pendingStorage
          this.pendingStorage = null
          try {
            await withTimeout(bridge.setLocalStorage('bunbarrage_stats', json))
          } catch { /* best effort */ }
          continue
        }
        break
      }
    } finally {
      this.busy = false
    }
    if (this.pendingStorage) setTimeout(() => this.kick(), Math.max(50, this.storageAt - performance.now()))
  }

  /** Root page: ask the host for its exit confirmation (required by Even Hub review). */
  requestExit(): void {
    if (!this.bridge) return
    this.exitDialog = true
    void this.bridge.shutDownPageContainer(1)
  }

  /**
   * Known host defect (SDK <= 0.0.16): after the exit dialog is dismissed with
   * "No", image sends can fail until relaunch; a rebuild makes it worse. Like
   * EvenChess we leave the page alone and, if images are dead, say so in text.
   */
  private async afterExitCancelled(): Promise<void> {
    this.kick()
    await new Promise((r) => setTimeout(r, 600))
    if (this.imageChannelDead) this.setText('msg', 'PLEASE REOPEN APP')
  }

  private onEvent(e: EvenHubEvent): void {
    const type = resolveType(e)
    if (this.exitDialog) {
      if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) return
      if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        this.exitDialog = false
        void this.afterExitCancelled()
        return
      }
    }
    switch (type) {
      case OsEventTypeList.SYSTEM_EXIT_EVENT:
        this.hooks.onSystemExit()
        return
      case OsEventTypeList.FOREGROUND_ENTER_EVENT:
        this.invalidate()
        return
      case OsEventTypeList.CLICK_EVENT:
        this.hooks.onAction('tap')
        return
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        this.hooks.onAction('back')
        return
      case OsEventTypeList.LONG_PRESS_EVENT:
        this.hooks.onAction('chargeStart')
        return
      case OsEventTypeList.LONG_PRESS_RELEASE_EVENT:
        this.hooks.onAction('chargeEnd')
        return
      case OsEventTypeList.SCROLL_TOP_EVENT:
      case OsEventTypeList.SCROLL_BOTTOM_EVENT: {
        const now = Date.now()
        if (now - this.lastScroll < 60) return
        this.lastScroll = now
        this.hooks.onAction(type === OsEventTypeList.SCROLL_TOP_EVENT ? 'scrollUp' : 'scrollDown')
        return
      }
    }
  }
}

/** The SDK sometimes drops CLICK (0) to undefined; the simulator uses sysEvent. */
function resolveType(e: EvenHubEvent): OsEventTypeList | undefined {
  const src = e.textEvent ?? e.listEvent ?? e.sysEvent
  const raw = src?.eventType ?? (e.jsonData as Record<string, unknown> | undefined)?.eventType
  if (typeof raw === 'number') return raw as OsEventTypeList
  if (typeof raw === 'string') {
    const v = raw.toUpperCase()
    if (v.includes('LONG_PRESS_RELEASE')) return OsEventTypeList.LONG_PRESS_RELEASE_EVENT
    if (v.includes('LONG_PRESS')) return OsEventTypeList.LONG_PRESS_EVENT
    if (v.includes('DOUBLE')) return OsEventTypeList.DOUBLE_CLICK_EVENT
    if (v.includes('SCROLL_TOP')) return OsEventTypeList.SCROLL_TOP_EVENT
    if (v.includes('SCROLL_BOTTOM')) return OsEventTypeList.SCROLL_BOTTOM_EVENT
    if (v.includes('CLICK')) return OsEventTypeList.CLICK_EVENT
  }
  if (src && raw === undefined) return OsEventTypeList.CLICK_EVENT
  return undefined
}
