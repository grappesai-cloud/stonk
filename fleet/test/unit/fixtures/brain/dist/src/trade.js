/**
 * Encodarea DE PROBA, identica in forma cu cea reala: TradeParams pentru
 * AgentAccount.executeTrade(bytes), cu PoolKey ordonat pe adresa.
 */
import { encodeAbiParameters } from 'viem'

const tradeParamsAbi = [
  {
    type: 'tuple',
    components: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' }
        ]
      },
      { name: 'hookData', type: 'bytes' }
    ]
  }
]

export function encodeTrade(t) {
  return encodeAbiParameters(tradeParamsAbi, [t])
}

export function poolKey(a, b, fee, tickSpacing, hooks) {
  const [c0, c1] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]
  return { currency0: c0, currency1: c1, fee, tickSpacing, hooks }
}
