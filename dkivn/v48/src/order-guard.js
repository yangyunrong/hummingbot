const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function isOwnedOrder(order, prefix = 'DKV48M_') {
  return String(order?.clientOrderId ?? '').startsWith(prefix);
}

export function validateOwnedPair({bid, ask} = {}) {
  if (bid && ask && finite(bid.price) >= finite(ask.price)) throw new Error('SELF_CROSS');
  return true;
}

export function shouldRequote(current, desired, nowMs, config = {}, tickSize = 0) {
  if (!current || !desired) return Boolean(current || desired);
  const currentPrice = finite(current.price);
  const desiredPrice = finite(desired.price);
  if (!(currentPrice > 0 && desiredPrice > 0)) return true;
  const age = Math.max(0, finite(nowMs) - finite(current.createdAt));
  if (age < finite(config.minQuoteLifeMs, 2500)) return false;
  const driftBps = Math.abs(desiredPrice - currentPrice) / currentPrice * 10000;
  const tickBps = finite(tickSize) > 0 ? finite(tickSize) / currentPrice * 10000 : 0;
  const thresholdBps = Math.max(finite(config.requoteBps, 2), tickBps);
  return driftBps >= thresholdBps;
}
