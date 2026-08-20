/**
 * Registrul meseriilor. Un agent nou se adauga aici si in configurare, nu prin
 * ramuri de if raspandite prin miez.
 */
import type { AgentKind } from '../core/config.js'
import type { Job } from '../core/work.js'
import { ringer } from './ringer.js'
import { miner } from './miner.js'
import { stocker } from './stocker.js'
import { lobbyist } from './lobbyist.js'
import { courier } from './courier.js'
import { trader } from './trader.js'

const JOBS: Record<AgentKind, Job<never>> = {
  ringer: ringer as unknown as Job<never>,
  miner: miner as unknown as Job<never>,
  stocker: stocker as unknown as Job<never>,
  lobbyist: lobbyist as unknown as Job<never>,
  courier: courier as unknown as Job<never>,
  trader: trader as unknown as Job<never>
}

export function jobFor(kind: AgentKind): Job<never> {
  const j = JOBS[kind]
  if (!j) throw new Error(`unknown agent kind: ${kind}`)
  return j
}

export { ringer, miner, stocker, lobbyist, courier, trader }
