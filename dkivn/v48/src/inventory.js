const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function inventorySnapshot(positionRows = []) {
  let longInventoryNotional = 0;
  let shortInventoryNotional = 0;
  let longPositionQty = 0;
  let shortPositionQty = 0;
  let longAvgPrice = 0;
  let shortAvgPrice = 0;
  let maxLeverage = 0;

  for (const row of Array.isArray(positionRows) ? positionRows : []) {
    const side = String(row?.side ?? row?.positionSide ?? '').toUpperCase();
    const notional = Math.abs(finite(row?.positionValue ?? row?.notional));
    const qty = Math.abs(finite(row?.position ?? row?.positionQty ?? row?.quantity));
    const avg = Math.max(0, finite(row?.avgPrice ?? row?.entryPrice));
    const leverage = Math.max(0, finite(row?.leverage));
    const active = notional > 0 || qty > 0;
    if (active) maxLeverage = Math.max(maxLeverage, leverage);
    if (side === 'LONG') {
      longInventoryNotional += notional;
      longPositionQty += qty;
      if (avg > 0) longAvgPrice = avg;
    } else if (side === 'SHORT') {
      shortInventoryNotional += notional;
      shortPositionQty += qty;
      if (avg > 0) shortAvgPrice = avg;
    }
  }

  return Object.freeze({
    longInventoryNotional,
    shortInventoryNotional,
    netInventoryNotional: longInventoryNotional - shortInventoryNotional,
    grossInventoryNotional: longInventoryNotional + shortInventoryNotional,
    longPositionQty,
    shortPositionQty,
    longAvgPrice,
    shortAvgPrice,
    maxLeverage,
  });
}

export function inventoryPolicy(snapshot = {}, config = {}) {
  const net = finite(snapshot.netInventoryNotional);
  const longNotional = Math.max(0, finite(snapshot.longInventoryNotional));
  const shortNotional = Math.max(0, finite(snapshot.shortInventoryNotional));
  const gross = Math.max(0, finite(snapshot.grossInventoryNotional, longNotional + shortNotional));
  const maxLeverage = Math.max(0, finite(snapshot.maxLeverage));
  const hard = Math.max(0.0001, Math.abs(finite(config.hardInventoryUsdt, 20)));
  const soft = Math.min(hard, Math.max(0, Math.abs(finite(config.softInventoryUsdt, hard / 2))));
  const maxLeverageForDualSide = Math.max(1, finite(config.maxLeverageForDualSide, 20));
  const ratio = Math.min(1, Math.abs(net) / hard);
  const maxSkewBps = 4;
  const skew = maxSkewBps * ratio;
  const hardLong = net >= hard;
  const hardShort = net <= -hard;
  const leverageReduceOnly = gross > 0 && maxLeverage > maxLeverageForDualSide;

  let allowBid = !hardLong;
  let allowAsk = !hardShort;
  let reduceOnly = false;
  let reduceSide = null;
  let reduceNotionalCap = null;

  if (leverageReduceOnly) {
    reduceOnly = true;
    if (net > 0) {
      allowBid = false;
      allowAsk = true;
      reduceSide = 'ASK';
      reduceNotionalCap = longNotional;
    } else if (net < 0) {
      allowBid = true;
      allowAsk = false;
      reduceSide = 'BID';
      reduceNotionalCap = shortNotional;
    } else {
      allowBid = false;
      allowAsk = false;
      reduceNotionalCap = 0;
    }
  }

  const softBreached = Math.abs(net) >= soft;
  const hardBreached = hardLong || hardShort || leverageReduceOnly;

  return Object.freeze({
    allowBid,
    allowAsk,
    bidSkewBps: net > 0 ? skew : net < 0 ? -skew : 0,
    askSkewBps: net > 0 ? -skew : net < 0 ? skew : 0,
    softBreached,
    hardBreached,
    utilization: ratio,
    maxLeverage,
    leverageReduceOnly,
    reduceOnly,
    reduceSide,
    reduceNotionalCap,
    longInventoryNotional: longNotional,
    shortInventoryNotional: shortNotional,
    netInventoryNotional: net,
    grossInventoryNotional: gross,
  });
}
