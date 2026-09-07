const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function inventorySnapshot(positionRows = []) {
  let longInventoryNotional = 0;
  let shortInventoryNotional = 0;
  let longPositionQty = 0;
  let shortPositionQty = 0;
  let longAvgPrice = 0;
  let shortAvgPrice = 0;

  for (const row of Array.isArray(positionRows) ? positionRows : []) {
    const side = String(row?.side ?? row?.positionSide ?? '').toUpperCase();
    const notional = Math.abs(finite(row?.positionValue ?? row?.notional));
    const qty = Math.abs(finite(row?.position ?? row?.positionQty ?? row?.quantity));
    const avg = Math.max(0, finite(row?.avgPrice ?? row?.entryPrice));
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
  });
}

export function inventoryPolicy(snapshot = {}, config = {}) {
  const net = finite(snapshot.netInventoryNotional);
  const hard = Math.max(0.0001, Math.abs(finite(config.hardInventoryUsdt, 20)));
  const soft = Math.min(hard, Math.max(0, Math.abs(finite(config.softInventoryUsdt, hard / 2))));
  const ratio = Math.min(1, Math.abs(net) / hard);
  const maxSkewBps = 4;
  const skew = maxSkewBps * ratio;
  const hardLong = net >= hard;
  const hardShort = net <= -hard;
  const softBreached = Math.abs(net) >= soft;

  return Object.freeze({
    allowBid: !hardLong,
    allowAsk: !hardShort,
    bidSkewBps: net > 0 ? skew : net < 0 ? -skew : 0,
    askSkewBps: net > 0 ? -skew : net < 0 ? skew : 0,
    softBreached,
    hardBreached: hardLong || hardShort,
    utilization: ratio,
  });
}
