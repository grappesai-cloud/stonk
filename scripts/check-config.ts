import { loadConfig } from '../src/core/config.js'
import { jobFor } from '../src/jobs/index.js'
for (const f of ['ringer', 'miner']) {
  const c = loadConfig(`./config/${f}.example.json`)
  const j = jobFor(c.agent.kind)
  const parsed = j.parse(c.job) as never
  console.log(f, 'ok |', c.agent.kind, '| cadence', c.runner.mode, '| required:', JSON.stringify(j.required(c, parsed)))
}
