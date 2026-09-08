export function loadConfig(env = process.env) {
  const n = (key, fallback) => Number.isFinite(Number(env[key])) ? Number(env[key]) : fallback;
  return Object.freeze({
    symbol: 'BTC-SWAP-USDT',
    botPrefix: 'DKV48M_',
    quoteNotional: n('V48_QUOTE_NOTIONAL', 10),
    minQuoteNotional: n('V48_MIN_QUOTE_NOTIONAL', 5),
    softInventoryUsdt: n('V48_SOFT_INVENTORY_USDT', 10),
    hardInventoryUsdt: n('V48_HARD_INVENTORY_USDT', 20),
    maxLeverageForDualSide: n('V48_MAX_LEVERAGE_FOR_DUAL_SIDE', 20),
    minQuoteLifeMs: n('V48_MIN_QUOTE_LIFE_MS', 2500),
    requoteBps: n('V48_REQUOTE_BPS', 2),
    marketStaleMs: n('V48_MARKET_STALE_MS', 2000),
    clockSkewHardMs: n('V48_CLOCK_SKEW_HARD_MS', 1500),
    apiErrorHardLimit: n('V48_API_ERROR_HARD_LIMIT', 3),
    dailyLossLimitUsdt: n('V48_DAILY_LOSS_LIMIT_USDT', 2),
    riskSoft: n('V48_RISK_SOFT', 75),
    riskHard: n('V48_RISK_HARD', 90),
    liveEnabled: String(env.GATEWAY_LIVE_ENABLED || 'false').toLowerCase() === 'true',
  });
}
