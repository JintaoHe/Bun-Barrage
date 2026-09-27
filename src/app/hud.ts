// Text shown in the glasses' text containers. Text updates are far cheaper
// than image updates over BLE, so everything that must react instantly
// (hearts, wind, angle, the live power meter, status messages) lives here.
// Strings are kept short: the firmware font is ~14 px per character and a
// wrapped line would be clipped.
import { MAX_HP, POWER_MIN, POWER_MAX } from '../game/constants'
import { type Game, PLAYER } from '../game/game'
import type { HudKey } from './glasses'

const hearts = (hp: number) => '♥'.repeat(hp) + '♡'.repeat(Math.max(0, MAX_HP - hp))

/** Thin-line meter: ━ filled, ─ empty (both measured one cell wide). */
export function powerBar(p: number, cells = 8): string {
  const n = Math.round(((p - POWER_MIN) / (POWER_MAX - POWER_MIN)) * cells)
  return '━'.repeat(n) + '─'.repeat(cells - n)
}

export function hudTexts(g: Game): Record<HudKey, string> {
  if (g.screen === 'title') {
    return { hudL: 'SWIPE: AIM', wind: 'HOLD: POWER', hudR: 'RELEASE: FIRE', info: `WINS ${g.stats.wins}  LOSE ${g.stats.losses}`, msg: 'TAP TO START' }
  }
  const w = g.wind
  const out: Record<HudKey, string> = {
    hudL: `BAO ${hearts(g.hp[0])}`,
    wind: w === 0 ? '～ CALM ～' : w > 0 ? `WIND ${'›'.repeat(w)}` : `${'‹'.repeat(-w)} WIND`,
    hudR: `${hearts(g.hp[1])} NORI`,
    info: ' ',
    msg: g.message,
  }
  if (g.screen === 'result') {
    out.info = `WINS ${g.stats.wins}  LOSE ${g.stats.losses}`
    out.msg = g.timer <= 0 ? `${g.message} TAP ▶` : g.message
    return out
  }
  if (g.turn === PLAYER) {
    const p = g.charging ? g.power[0] : g.lastPower[0]
    out.info = g.charging || p > 0 ? `${g.angle[0]}°  ${powerBar(p)}  ${p}` : `${g.angle[0]}°  HOLD TO FIRE`
    if (!g.message && g.phase === 'aim' && (g.round < 1 || g.hintT > 0)) out.msg = 'SWIPE AIM, HOLD FIRE'
  } else {
    const p = g.phase === 'cpuCharge' ? g.power[1] : g.lastPower[1] || POWER_MIN
    out.info = `${g.angle[1]}°  ${powerBar(p)}`
  }
  return out
}
