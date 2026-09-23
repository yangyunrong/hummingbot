"use client";
import type { AlertView } from "../lib/api";

export function AlertList({ alerts }: { alerts: AlertView[] }) {
  if (!alerts.length) return <div className="empty">No active alerts</div>;
  return (
    <div className="card">
      {alerts.map(alert => (
        <div className="alertRow" key={alert.id}>
          <span className={`badge ${alert.level === "P0" ? "danger" : alert.level === "P1" ? "warn" : "neutral"}`}>{alert.level}</span>
          <span>{alert.venue ?? "SYSTEM"} · {alert.symbol ?? "GLOBAL"}</span>
          <span><span className="alertSummary">{alert.summary}</span><br/><span className="muted">{alert.rootCauseCode}</span></span>
          <span>{alert.automaticAction}</span>
          <span>{Math.round(alert.ageMs / 1000)}s</span>
        </div>
      ))}
    </div>
  );
}
