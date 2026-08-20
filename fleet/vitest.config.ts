import { defineConfig } from 'vitest/config'

/**
 * Testele care forkeaza lantul real NU au voie sa ruleze in paralel.
 *
 * Doua forkuri deodata inseamna dublu trafic catre acelasi RPC public, iar
 * Cloudflare-ul din fata lui raspunde cu o provocare de bot. Testele sar
 * elegant cand se intampla, dar o suita care sare pe jumatate din probe nu e o
 * suita verde, e una care tace.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 240_000,
    hookTimeout: 240_000
  }
})
