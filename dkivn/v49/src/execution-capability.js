export function executionCapability(input={}) {
  const mode=String(input.executorMode||'').toUpperCase();
  const trade=String(input.tradePermissionStatus||'').toUpperCase();
  if (mode !== 'V49_LIVE') return {startAllowed:false,reason:'EXECUTOR_OFFLINE'};
  if (!input.liveEnabled) return {startAllowed:false,reason:'LIVE_DISABLED'};
  if (trade !== 'VERIFIED') return {startAllowed:false,reason:'TRADE_NOT_VERIFIED'};
  if (!input.publicWs) return {startAllowed:false,reason:'PUBLIC_WS_OFFLINE'};
  if (!input.privateWs) return {startAllowed:false,reason:'PRIVATE_WS_OFFLINE'};
  return {startAllowed:true,reason:'READY'};
}
