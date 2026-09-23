"use client";

export type VenueRuntime = {
  venue: "TOOBIT" | "BITGET";
  runtimeState: string;
  sourceAt: string;
  sourceAgeMs: number;
  stale: boolean;
  publicWsAgeMs: number;
  privateWsAgeMs: number;
  truthAgeMs: number;
  todayVolumeUsdt: number;
  makerVolumeUsdt: number;
  takerVolumeUsdt: number;
  realizedPnlUsdt: number;
  feesUsdt: number;
  rebateUsdt: number;
  fundingUsdt: number;
  coreWearBps: number;
  netWearBps: number;
  activeOrders: number;
  maxOrders: number;
  netInventoryUsdt: number;
  coverageDeficitUsdt: number;
  latency: {
    sendToAckP50Ms: number;
    sendToAckP95Ms: number;
    sendToAckP99Ms: number;
    eventLoopP99Ms: number;
    gcPauseP99Ms: number;
  };
};

export type SymbolRuntime = {
  venue: "TOOBIT" | "BITGET";
  symbol: string;
  sourceAt: string;
  sourceAgeMs: number;
  stale: boolean;
  strategyMode: string;
  regime: string;
  activeOrders: number;
  maxOrders: number;
  longInventoryUsdt: number;
  shortInventoryUsdt: number;
  netInventoryUsdt: number;
  todayVolumeUsdt: number;
  makerRatio: number;
  bidEvBps: number;
  askEvBps: number;
  toxicity: number;
  markout500Bps: number;
  alertLevel: "P0" | "P1" | "P2" | null;
};

export type AlertView = {
  id: string;
  level: "P0" | "P1" | "P2";
  venue: "TOOBIT" | "BITGET" | null;
  symbol: string | null;
  type: string;
  startedAt: string;
  lastSeenAt: string;
  ageMs: number;
  summary: string;
  rootCauseCode: string;
  automaticAction: string;
  resolvedAt: string | null;
};

const BASE = process.env.NEXT_PUBLIC_CONTROL_API_BASE_URL ?? "";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json() as Promise<T>;
}

export const api = {
  venues: () => getJson<VenueRuntime[]>("/api/runtime/venues"),
  symbols: () => getJson<SymbolRuntime[]>("/api/runtime/symbols"),
  activeAlerts: () => getJson<AlertView[]>("/api/alerts?active=true"),
  alerts: () => getJson<AlertView[]>("/api/alerts"),
};

export function money(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} U`;
}

export function number(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function bps(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${number(value, 2)} bps` : "—";
}

export function pct(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${number((value ?? 0) * 100, 1)}%` : "—";
}
