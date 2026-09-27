// Keyboard and on-screen phone buttons. On the glasses the game is played with
// the temple touchpads / R1 ring (handled in glasses.ts); these mirror them:
//   Up/Down (or ▲▼ buttons) = swipe (angle)
//   hold Space (or hold FIRE) = long press (charge), release = fire
//   Enter (or TAP) = tap / start, Esc (or BACK) = double tap
import type { Action } from '../game/game'

export type Dir = 'up' | 'down'
const REPEAT_DELAY = 0.3
const REPEAT_STEP = 0.08

export class Input {
  private held: Record<Dir, number> = { up: -1, down: -1 }
  private next: Record<Dir, number> = { up: 0, down: 0 }
  private keys = new Set<Dir>()
  private touch = new Set<Dir>()
  private queue: Action[] = []

  constructor(private emit: (a: Action) => void) {}

  attachKeyboard(target: Window): void {
    const map: Record<string, Dir> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' }
    target.addEventListener('keydown', (e) => {
      const d = map[e.code]
      if (d) { e.preventDefault(); this.keys.add(d); return }
      if (e.repeat) return
      if (e.code === 'Space') { e.preventDefault(); this.queue.push('chargeStart') }
      else if (e.code === 'Enter') this.queue.push('tap')
      else if (e.code === 'Escape' || e.code === 'Backspace') this.queue.push('back')
    })
    target.addEventListener('keyup', (e) => {
      const d = map[e.code]
      if (d) this.keys.delete(d)
      if (e.code === 'Space') { e.preventDefault(); this.queue.push('chargeEnd') }
    })
    target.addEventListener('blur', () => this.keys.clear())
  }

  /** Phone buttons: ▲/▼ repeat while held; FIRE charges while held. */
  press(button: Dir | 'fire' | 'tap' | 'back', down: boolean): void {
    if (button === 'up' || button === 'down') {
      if (down) this.touch.add(button)
      else this.touch.delete(button)
      return
    }
    if (button === 'fire') this.queue.push(down ? 'chargeStart' : 'chargeEnd')
    else if (down) this.queue.push(button)
    this.flush()
  }

  /** Deliver queued actions right away (don't wait for the next tick). */
  private flush(): void {
    for (const a of this.queue.splice(0)) this.emit(a)
  }

  poll(dt: number): void {
    this.flush()
    for (const d of ['up', 'down'] as Dir[]) {
      if (!this.keys.has(d) && !this.touch.has(d)) { this.held[d] = -1; continue }
      if (this.held[d] < 0) { this.held[d] = 0; this.next[d] = REPEAT_DELAY; this.emit(d); continue }
      this.held[d] += dt
      while (this.held[d] >= this.next[d]) { this.emit(d); this.next[d] += REPEAT_STEP }
    }
  }
}
