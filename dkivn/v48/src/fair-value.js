const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function microPrice({bestBid,bestAsk,bestBidQty,bestAskQty}) {
  const bid = finite(bestBid);
  const ask = finite(bestAsk);
  const bidQty = Math.max(0, finite(bestBidQty));
  const askQty = Math.max(0, finite(bestAskQty));
  const denom = bidQty + askQty;
  return denom > 0 ? (ask * bidQty + bid * askQty) / denom : (bid + ask) / 2;
}

export function fairPrice(book, depthImbalance = 0, imbalanceBps = 0) {
  const bid = finite(book?.bestBid);
  const ask = finite(book?.bestAsk);
  if (!(bid > 0 && ask > bid)) return null;
  const mid = (bid + ask) / 2;
  const imbalance = clamp(finite(depthImbalance), -1, 1);
  const adjustment = mid * finite(imbalanceBps) / 10000 * imbalance;
  return clamp(microPrice(book) + adjustment, bid, ask);
}

export class RollingVolatility {
  constructor(maxSamples = 30) {
    this.maxSamples = Math.max(2, Math.floor(finite(maxSamples, 30)));
    this.prices = [];
  }

  push(price) {
    const p = finite(price);
    if (!(p > 0)) return false;
    this.prices.push(p);
    if (this.prices.length > this.maxSamples) this.prices.splice(0, this.prices.length - this.maxSamples);
    return true;
  }

  valueBps() {
    if (this.prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < this.prices.length; i += 1) returns.push(Math.log(this.prices[i] / this.prices[i - 1]));
    if (!returns.length) return 0;
    const rms = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length);
    return rms * 10000;
  }
}
