// DKIVN Hybrid-MM VNext
// Pure, allocation-light strategy core. No network I/O, no exchange mutation.

export const SIDE = Object.freeze({ BID: 1, ASK: 2 });

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function computeDynamicGamma(baseGamma, toxicity, inventoryAbsNorm, gammaToxicityMult = 2, gammaInventoryMult = 2) {
  const t = clamp(toxicity, 0, 1);
  const q = clamp(inventoryAbsNorm, 0, 1);
  return baseGamma * (1 + gammaToxicityMult * t + gammaInventoryMult * q);
}

export function computeReservationPrice(mid, inventoryQNorm, gamma, sigma2) {
  return mid - inventoryQNorm * gamma * sigma2 * mid;
}

export function computeASOptimalHalfSpreadBps(gamma, sigma2, kappa, horizon = 1) {
  const safeKappa = Math.max(kappa, 1e-9);
  const g = Math.max(gamma, 1e-9);
  const riskTerm = g * sigma2 * Math.max(horizon, 0);
  const liquidityTerm = (2 / g) * Math.log1p(g / safeKappa);
  // Model output is normalized; convert to bps for DKIVN quoting.
  return Math.max(0, (riskTerm + liquidityTerm) * 5000);
}

export function inventoryPolicy(netInventoryNotional, softLimit, hardLimit, out) {
  const abs = Math.abs(netInventoryNotional);
  const hard = Math.max(hardLimit, 1e-9);
  const soft = Math.max(softLimit, 0);
  const norm = clamp(abs / hard, 0, 1);

  out.allowBid = true;
  out.allowAsk = true;
  out.bidWidenMult = 1;
  out.askWidenMult = 1;
  out.bidSizeMult = 1;
  out.askSizeMult = 1;
  out.inventoryAbsNorm = norm;

  if (netInventoryNotional > 0) {
    // Long inventory: discourage more buys, encourage sells.
    out.bidWidenMult = 1 + norm;
    out.askWidenMult = Math.max(0, 1 - norm);
    out.bidSizeMult = Math.max(0, 1 - norm);
    out.askSizeMult = 1 + norm;
    if (abs >= hard) out.allowBid = false;
  } else if (netInventoryNotional < 0) {
    // Short inventory: discourage more sells, encourage buys.
    out.askWidenMult = 1 + norm;
    out.bidWidenMult = Math.max(0, 1 - norm);
    out.askSizeMult = Math.max(0, 1 - norm);
    out.bidSizeMult = 1 + norm;
    if (abs >= hard) out.allowAsk = false;
  }

  // Soft-limit acceleration without discontinuity.
  if (abs > soft && hard > soft) {
    const z = clamp((abs - soft) / (hard - soft), 0, 1);
    if (netInventoryNotional > 0) {
      out.bidWidenMult += z;
      out.askWidenMult *= (1 - 0.5 * z);
    } else if (netInventoryNotional < 0) {
      out.askWidenMult += z;
      out.bidWidenMult *= (1 - 0.5 * z);
    }
  }
  return out;
}

export function expectedMakerEvBps(rebateBps, spreadCaptureBps, markoutBps, inventoryCostBps, latencyCostBps, queuePenaltyBps) {
  return rebateBps + spreadCaptureBps - markoutBps - inventoryCostBps - latencyCostBps - queuePenaltyBps;
}

export function shouldRequote(currentPrice, desiredPrice, quoteAgeMs, minQuoteLifeMs, thresholdBps, safetyOverride) {
  if (safetyOverride) return true;
  if (!(currentPrice > 0) || !(desiredPrice > 0)) return true;
  if (quoteAgeMs < minQuoteLifeMs) return false;
  const diffBps = Math.abs(desiredPrice - currentPrice) / currentPrice * 10000;
  return diffBps >= thresholdBps;
}

export function createHybridMMState() {
  return {
    inventory: {
      allowBid: true, allowAsk: true,
      bidWidenMult: 1, askWidenMult: 1,
      bidSizeMult: 1, askSizeMult: 1,
      inventoryAbsNorm: 0,
    },
    reservationPrice: 0,
    dynamicGamma: 0,
    optimalHalfSpreadBps: 0,
    bid: { enabled: false, price: 0, sizeMult: 0, evBps: 0, reason: 0 },
    ask: { enabled: false, price: 0, sizeMult: 0, evBps: 0, reason: 0 },
  };
}

// reason codes
export const REASON = Object.freeze({
  OK: 0,
  TRUTH_UNHEALTHY: 1,
  MARKET_STALE: 2,
  TOXIC: 3,
  NEGATIVE_EV: 4,
  INVENTORY_BLOCK: 5,
  INVALID_BOOK: 6,
});

export function evaluateHybridMM(input, out) {
  const bid = out.bid;
  const ask = out.ask;
  bid.enabled = false;
  ask.enabled = false;
  bid.reason = REASON.OK;
  ask.reason = REASON.OK;

  if (!input.truthHealthy) {
    bid.reason = ask.reason = REASON.TRUTH_UNHEALTHY;
    return out;
  }
  if (input.marketAgeMs > input.marketStaleMs) {
    bid.reason = ask.reason = REASON.MARKET_STALE;
    return out;
  }
  if (!(input.bestBid > 0) || !(input.bestAsk > input.bestBid)) {
    bid.reason = ask.reason = REASON.INVALID_BOOK;
    return out;
  }

  inventoryPolicy(
    input.netInventoryNotional,
    input.softInventoryLimit,
    input.hardInventoryLimit,
    out.inventory
  );

  out.dynamicGamma = computeDynamicGamma(
    input.baseGamma,
    input.toxicity,
    out.inventory.inventoryAbsNorm,
    input.gammaToxicityMult,
    input.gammaInventoryMult
  );

  out.reservationPrice = computeReservationPrice(
    input.referencePrice,
    input.inventoryQNorm,
    out.dynamicGamma,
    input.sigma2
  );

  out.optimalHalfSpreadBps = computeASOptimalHalfSpreadBps(
    out.dynamicGamma,
    input.sigma2,
    input.kappa,
    input.horizon
  );

  const toxic = input.toxicity >= input.toxicityHardStop;
  const halfBase = Math.max(out.optimalHalfSpreadBps, input.minHalfSpreadBps);

  const bidHalfBps = halfBase * out.inventory.bidWidenMult + input.bidToxicitySkewBps;
  const askHalfBps = halfBase * out.inventory.askWidenMult + input.askToxicitySkewBps;

  let desiredBid = out.reservationPrice * (1 - bidHalfBps / 10000);
  let desiredAsk = out.reservationPrice * (1 + askHalfBps / 10000);

  // post-only / no-cross clamps
  desiredBid = Math.min(desiredBid, input.bestAsk - input.tickSize);
  desiredAsk = Math.max(desiredAsk, input.bestBid + input.tickSize);

  if (desiredBid >= desiredAsk) {
    const mid = (input.bestBid + input.bestAsk) * 0.5;
    desiredBid = Math.min(input.bestBid, mid - input.tickSize);
    desiredAsk = Math.max(input.bestAsk, mid + input.tickSize);
  }

  const bidSpreadCapture = Math.max(0, (input.referencePrice - desiredBid) / input.referencePrice * 10000);
  const askSpreadCapture = Math.max(0, (desiredAsk - input.referencePrice) / input.referencePrice * 10000);

  bid.evBps = expectedMakerEvBps(
    input.rebateBps,
    bidSpreadCapture,
    input.bidExpectedMarkoutCostBps,
    input.bidInventoryCostBps,
    input.latencyCostBps,
    input.bidQueuePenaltyBps
  );
  ask.evBps = expectedMakerEvBps(
    input.rebateBps,
    askSpreadCapture,
    input.askExpectedMarkoutCostBps,
    input.askInventoryCostBps,
    input.latencyCostBps,
    input.askQueuePenaltyBps
  );

  bid.price = desiredBid;
  ask.price = desiredAsk;
  bid.sizeMult = out.inventory.bidSizeMult;
  ask.sizeMult = out.inventory.askSizeMult;

  if (!out.inventory.allowBid) {
    bid.reason = REASON.INVENTORY_BLOCK;
  } else if (toxic && input.bidToxicitySkewBps >= input.toxicityCancelSkewBps) {
    bid.reason = REASON.TOXIC;
  } else if (bid.evBps < input.minEvBps) {
    bid.reason = REASON.NEGATIVE_EV;
  } else {
    bid.enabled = true;
  }

  if (!out.inventory.allowAsk) {
    ask.reason = REASON.INVENTORY_BLOCK;
  } else if (toxic && input.askToxicitySkewBps >= input.toxicityCancelSkewBps) {
    ask.reason = REASON.TOXIC;
  } else if (ask.evBps < input.minEvBps) {
    ask.reason = REASON.NEGATIVE_EV;
  } else {
    ask.enabled = true;
  }

  return out;
}
