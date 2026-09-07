const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

function hardFailure(ctx = {}, config = {}) {
  if (!ctx.publicWs) return 'PUBLIC_WS_OFFLINE';
  if (!ctx.privateWs) return 'PRIVATE_WS_OFFLINE';
  if (finite(ctx.marketDataAgeMs, Infinity) > finite(config.marketStaleMs, 2000)) return 'MARKET_STALE';
  if (Math.abs(finite(ctx.clockSkewMs)) > finite(config.clockSkewHardMs, 1500)) return 'CLOCK_SKEW_HIGH';
  if (ctx.reconciliationAmbiguous) return 'RECONCILIATION_AMBIGUOUS';
  if (ctx.selfCrossGuardFailed) return 'SELF_CROSS_GUARD';
  if (finite(ctx.apiErrorStreak) >= finite(config.apiErrorHardLimit, 3)) return 'API_ERROR_STREAK';
  if (finite(ctx.dailyPnl) <= -Math.abs(finite(config.dailyLossLimitUsdt, 2))) return 'DAILY_LOSS_LIMIT';
  if (finite(ctx.riskRate) >= finite(config.riskHard, 90)) return 'RISK_RATE_HARD_LIMIT';
  return null;
}

function sidePolicy(ctx = {}) {
  const p = ctx.inventoryPolicy ?? {};
  return { allowBid: p.allowBid !== false, allowAsk: p.allowAsk !== false, hardBreached: Boolean(p.hardBreached), softBreached: Boolean(p.softBreached) };
}

export function evaluateReadiness(ctx = {}, config = {}) {
  const failure = hardFailure(ctx, config);
  const sides = sidePolicy(ctx);
  if (failure) return Object.freeze({ok:false,state:'DISARMED',reason:failure,allowBid:false,allowAsk:false});
  if (ctx.accountReady === false) return Object.freeze({ok:false,state:'DISARMED',reason:'ACCOUNT_SNAPSHOT_UNAVAILABLE',allowBid:false,allowAsk:false});
  if (config.liveEnabled === false) return Object.freeze({ok:false,state:'DISARMED',reason:'LIVE_DISABLED',allowBid:false,allowAsk:false});
  return Object.freeze({ok:true,state:'READY',reason:'READY',allowBid:sides.allowBid,allowAsk:sides.allowAsk});
}

export function evaluateRuntimeRisk(ctx = {}, config = {}) {
  const failure = hardFailure(ctx, config);
  const sides = sidePolicy(ctx);
  if (failure) return Object.freeze({ok:false,state:'DISARMED',reason:failure,allowBid:false,allowAsk:false});
  if (sides.hardBreached || !sides.allowBid || !sides.allowAsk) return Object.freeze({ok:true,state:'RISK_REDUCE',reason:'INVENTORY_HARD_LIMIT',allowBid:sides.allowBid,allowAsk:sides.allowAsk});
  return Object.freeze({ok:true,state:'RUNNING',reason:sides.softBreached?'INVENTORY_SOFT_LIMIT':'MAKER_ACTIVE',allowBid:sides.allowBid,allowAsk:sides.allowAsk});
}
