import { buildContext } from '../src/core/context.js'
import { sitePayload } from '../src/core/api/server.js'
const ctx = buildContext(process.argv[2] ?? './config/courier.json')
console.log(JSON.stringify(sitePayload(ctx), null, 2))
ctx.ledger.close()
