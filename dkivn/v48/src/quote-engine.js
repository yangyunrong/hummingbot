import { validateOwnedPair } from './order-guard.js';

const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const roundDown = (value, tick) => Math.floor((value + 1e-12) / tick) * tick;
const roundUp = (value, tick) => Math.ceil((value - 1e-12) / tick) * tick;
const clean = (value, tick) => Number(value.toFixed(Math.max(0, String(tick).split('.')[1]?.length ?? 0) + 2));

export function buildDesiredQuotes({market, fair, inventory = {}, config = {}, tickSize = 0.1, feeBps = 0, adverseSelectionBps = 0} = {}) {
  const bestBid = finite(market?.bestBid);
  const bestAsk = finite(market?.bestAsk);
  const fairValue = finite(fair);
  const tick = Math.max(1e-12, finite(tickSize, 0.1));
  if (!(bestBid > 0 && bestAsk > bestBid && fairValue >= bestBid && fairValue <= bestAsk)) throw new Error('INVALID_MARKET');

  const minEdgeBps = Math.max(0, 2 * finite(feeBps) + finite(adverseSelectionBps));
  const halfEdgeBps = minEdgeBps / 2;
  const quoteNotional = Math.max(0, finite(config.quoteNotional, 10));
  const minQuoteNotional = Math.max(0, finite(config.minQuoteNotional, 5));
  const notionalFor = (side) => {
    let value = quoteNotional;
    if (inventory.reduceOnly === true && String(inventory.reduceSide || '').toUpperCase() === side) {
      value = Math.min(value, Math.max(0, finite(inventory.reduceNotionalCap)));
    }
    return value >= minQuoteNotional ? value : 0;
  };
  let bid = null;
  let ask = null;

  const bidNotional = notionalFor('BID');
  if (inventory.allowBid !== false && bidNotional > 0) {
    const bidDistance = Math.max(0, halfEdgeBps + finite(inventory.bidSkewBps));
    const raw = fairValue * (1 - bidDistance / 10000);
    const passiveCap = bestAsk - tick;
    const price = clean(roundDown(Math.min(raw, passiveCap), tick), tick);
    if (price > 0 && price < bestAsk) bid = { side: 'BUY', price, notional: bidNotional, timeInForce: 'POST_ONLY', type: 'LIMIT' };
  }

  const askNotional = notionalFor('ASK');
  if (inventory.allowAsk !== false && askNotional > 0) {
    const askDistance = Math.max(0, halfEdgeBps + finite(inventory.askSkewBps));
    const raw = fairValue * (1 + askDistance / 10000);
    const passiveFloor = bestBid + tick;
    const price = clean(roundUp(Math.max(raw, passiveFloor), tick), tick);
    if (price > bestBid) ask = { side: 'SELL', price, notional: askNotional, timeInForce: 'POST_ONLY', type: 'LIMIT' };
  }

  if (bid && ask) {
    const currentEdgeBps = (ask.price - bid.price) / fairValue * 10000;
    if (currentEdgeBps < minEdgeBps) {
      const extraHalf = (minEdgeBps - currentEdgeBps) / 2;
      bid.price = clean(roundDown(bid.price * (1 - extraHalf / 10000), tick), tick);
      ask.price = clean(roundUp(ask.price * (1 + extraHalf / 10000), tick), tick);
    }
  }

  validateOwnedPair({bid, ask});
  return Object.freeze({ bid, ask, minEdgeBps });
}
