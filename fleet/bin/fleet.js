#!/usr/bin/env node
// invelis care ascunde avertismentul de API experimental al lui node:sqlite
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return
  console.warn(w.stack ?? w.message)
})
await import('../dist/src/cli.js')
