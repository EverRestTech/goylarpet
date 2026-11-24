// Set address AND confirmed only after the author confirms this exact pair.
// Network selection is explicit even where two networks share an address format.
export const pairs = [
  { token: 'USDT', network: 'TRON (TRC-20)', asset: 'USDT', address: null, confirmed: false },
  { token: 'USDT', network: 'BNB Smart Chain (BEP-20)', asset: 'Binance-Peg USDT', address: null, confirmed: false },
  { token: 'USDT', network: 'Ethereum (ERC-20)', asset: 'USDT', address: null, confirmed: false },
  { token: 'USDT', network: 'Solana', asset: 'USDT', address: null, confirmed: false },
  { token: 'USDC', network: 'Base', asset: 'Native USDC', address: null, confirmed: false },
  { token: 'USDC', network: 'Polygon PoS', asset: 'Native USDC', address: null, confirmed: false },
  { token: 'USDC', network: 'Solana', asset: 'Native USDC', address: null, confirmed: false },
  { token: 'BTC', network: 'Bitcoin mainnet', asset: 'BTC (on-chain)', address: null, confirmed: false },
  { token: 'ETH', network: 'Ethereum mainnet', asset: 'ETH', address: null, confirmed: false },
  { token: 'ETH', network: 'Base', asset: 'ETH', address: null, confirmed: false }
];
