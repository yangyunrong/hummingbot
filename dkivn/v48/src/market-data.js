const toFinite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizedData = (payload) => {
  const data = payload?.data ?? payload;
  return Array.isArray(data) ? (data[0] ?? {}) : (data ?? {});
};

export class MarketDataEngine {
  constructor(symbol) {
    this.symbol = symbol;
    this.top = null;
    this.bids = new Map();
    this.asks = new Map();
    this.lastValidUpdateMs = 0;
  }

  onBookTicker(payload, recvMs = Date.now()) {
    const x = normalizedData(payload);
    const bid = toFinite(x.b ?? x.bidPrice);
    const ask = toFinite(x.a ?? x.askPrice);
    const bidQty = toFinite(x.bq ?? x.bidQty);
    const askQty = toFinite(x.aq ?? x.askQty);
    if (!(bid > 0 && ask > bid && bidQty >= 0 && askQty >= 0)) return false;
    this.top = { bid, ask, bidQty, askQty };
    this.lastValidUpdateMs = recvMs;
    return true;
  }

  onDiffDepth(payload, recvMs = Date.now()) {
    const x = normalizedData(payload);
    const nextBids = new Map(this.bids);
    const nextAsks = new Map(this.asks);
    this.#applyLevels(nextBids, x.b ?? x.bids);
    this.#applyLevels(nextAsks, x.a ?? x.asks);
    const bids = this.#sorted(nextBids, true);
    const asks = this.#sorted(nextAsks, false);
    if (bids.length && asks.length && asks[0][0] <= bids[0][0]) return false;
    this.bids = nextBids;
    this.asks = nextAsks;
    if (bids.length && asks.length) {
      this.top = {
        bid: bids[0][0],
        ask: asks[0][0],
        bidQty: bids[0][1],
        askQty: asks[0][1],
      };
    }
    this.lastValidUpdateMs = recvMs;
    return true;
  }

  snapshot(nowMs = Date.now()) {
    const bids = this.#sorted(this.bids, true);
    const asks = this.#sorted(this.asks, false);
    const top = this.top ?? {
      bid: bids[0]?.[0] ?? null,
      ask: asks[0]?.[0] ?? null,
      bidQty: bids[0]?.[1] ?? null,
      askQty: asks[0]?.[1] ?? null,
    };
    const bestBid = top.bid ?? null;
    const bestAsk = top.ask ?? null;
    const bidDepth = bids.reduce((sum, [, qty]) => sum + qty, 0);
    const askDepth = asks.reduce((sum, [, qty]) => sum + qty, 0);
    const denom = bidDepth + askDepth;
    return {
      bestBid,
      bestAsk,
      bestBidQty: top.bidQty ?? null,
      bestAskQty: top.askQty ?? null,
      midPrice: bestBid > 0 && bestAsk > bestBid ? (bestBid + bestAsk) / 2 : null,
      depthImbalance: denom > 0 ? (bidDepth - askDepth) / denom : 0,
      marketDataAgeMs: this.lastValidUpdateMs ? Math.max(0, nowMs - this.lastValidUpdateMs) : Infinity,
      bids,
      asks,
    };
  }

  #applyLevels(book, levels) {
    if (!Array.isArray(levels)) return;
    for (const level of levels) {
      if (!Array.isArray(level) || level.length < 2) continue;
      const price = toFinite(level[0]);
      const qty = toFinite(level[1]);
      if (!(price > 0) || !(qty >= 0)) continue;
      if (qty === 0) book.delete(price);
      else book.set(price, qty);
    }
  }

  #sorted(book, descending) {
    return [...book.entries()]
      .sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0])
      .slice(0, 10);
  }
}
