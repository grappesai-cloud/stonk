/**
 * Agregator DE PROBA: quote determinist, zero retea. Forma identica cu cea
 * reala: encodarea pentru executeAggregatorTrade(bytes) si un fetch care
 * intoarce router + calldata + minim.
 */
import { encodeAbiParameters } from 'viem'

export function encodeAggregatorTrade(t) {
  return encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes' }
    ],
    [t.tokenIn, t.tokenOut, t.amountIn, t.minAmountOut, t.aggregator, t.swapData]
  )
}

export async function fetch1inchSwap(chainId, from, tokenIn, tokenOut, amountIn, slippagePct) {
  return {
    aggregator: '0x00000000000000000000000000000000000a11ce',
    swapData: '0xdeadbeef',
    minAmountOut: 0n
  }
}
