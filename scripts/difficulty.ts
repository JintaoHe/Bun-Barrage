import { createGame, startMatch, dispatch, update } from '../src/game/game'
const turns: number[] = []
let firstHit = 0
for (let seed = 1; seed <= 60; seed++) {
  const g = createGame(seed); startMatch(g)
  let cpuShots = 0, prevTurn = g.turn, guard = 0, first = true
  while (g.screen === 'play' && guard++ < 60 * 600) {
    if (g.phase === 'aim') { dispatch(g, 'chargeStart'); dispatch(g, 'chargeEnd'); g.shot!.x = -50 }
    const hpBefore = g.hp[0]
    update(g, 1 / 60)
    if (g.turn !== prevTurn && prevTurn === 1) { cpuShots++; }
    if (first && g.hp[0] < hpBefore && g.turn === 1) { firstHit += cpuShots === 0 ? 1 : 0; first = false }
    prevTurn = g.turn
  }
  turns.push(cpuShots + 1)
}
turns.sort((a, b) => a - b)
console.log('CPU shots to beat an idle player: median', turns[30], 'min', turns[0], 'max', turns[59])
console.log('CPU hit on its very first shot in', firstHit, '/ 60 matches')
