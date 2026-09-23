import type { AlertEvent, RuntimeState } from "@dkivn/contracts";

export type TelegramSend = (message: string) => Promise<void>;

const MARKDOWN_V2_SPECIAL = /[\\_*\[\]()~`>#+\-=|{}.!]/g;

export function escapeMarkdownV2(value: string): string {
  return value.replace(MARKDOWN_V2_SPECIAL, "\\$&");
}

function numericRisk(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) > 0;
}

function hasOpenRisk(snapshot: Record<string, unknown>): boolean {
  const numericKeys = [
    "positionQty",
    "longQty",
    "shortQty",
    "openOrders",
    "activeOrders",
    "coverageDeficitUsdt",
  ];

  for (const key of numericKeys) {
    const value = snapshot[key];
    if (numericRisk(value)) return true;
    if (Array.isArray(value) && value.length > 0) return true;
  }

  return snapshot.openPosition === true || snapshot.hasOpenOrders === true;
}

function stoppedAlertIsActionable(alert: AlertEvent): boolean {
  if (alert.level !== "P0") return false;
  if (![
    "POSITION_COVERAGE_DIVERGENCE",
    "UNKNOWN_ORDER",
    "TRUTH_UNSYNCED",
  ].includes(alert.type)) {
    return false;
  }
  return hasOpenRisk(alert.truthSnapshot);
}

export function formatTelegramAlert(alert: AlertEvent): string {
  const venue = escapeMarkdownV2(alert.venue ?? "SYSTEM");
  const symbol = escapeMarkdownV2(alert.symbol ?? "GLOBAL");
  const summary = escapeMarkdownV2(alert.summary);
  const action = escapeMarkdownV2(alert.automaticAction);
  const ageSeconds = Math.max(0, Math.round(alert.ageMs / 1000));

  return [
    `🚨 DKIVN ${escapeMarkdownV2(alert.level)}`,
    `${venue} · ${symbol}`,
    "",
    summary,
    `Age: ${ageSeconds}s`,
    `Action: ${action}`,
  ].join("\n");
}

export async function dispatchAlert(options: {
  alert: AlertEvent;
  runtimeState: RuntimeState;
  send: TelegramSend;
}): Promise<boolean> {
  const { alert, runtimeState, send } = options;

  if (runtimeState === "STOPPED" && !stoppedAlertIsActionable(alert)) {
    return false;
  }

  await send(formatTelegramAlert(alert));
  return true;
}
