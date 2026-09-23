"use client";
import type { SymbolRuntime } from "../lib/api";
import { bps, money, pct } from "../lib/api";

export function SymbolsTable({ rows }: { rows: SymbolRuntime[] }) {
  if (!rows.length) return <div className="empty">No symbol runtime data</div>;
  return (
    <div className="tableWrap">
      <table>
        <thead><tr>
          {["Symbol","Venue","Strategy","Regime","Orders","Long","Short","Net","Volume","Maker","Bid EV","Ask EV","Toxicity","Markout500","Alert"].map(h => <th key={h}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={`${row.venue}:${row.symbol}`}>
              <td><b>{row.symbol}</b></td><td>{row.venue}</td><td>{row.strategyMode}</td><td>{row.regime}</td>
              <td>{row.activeOrders} / {row.maxOrders}</td>
              <td>{money(row.longInventoryUsdt)}</td><td>{money(row.shortInventoryUsdt)}</td><td>{money(row.netInventoryUsdt)}</td>
              <td>{money(row.todayVolumeUsdt)}</td><td>{pct(row.makerRatio)}</td><td>{bps(row.bidEvBps)}</td><td>{bps(row.askEvBps)}</td>
              <td>{pct(row.toxicity)}</td><td>{bps(row.markout500Bps)}</td>
              <td>{row.alertLevel ? <span className={`badge ${row.alertLevel === "P0" ? "danger" : "warn"}`}>{row.alertLevel}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
