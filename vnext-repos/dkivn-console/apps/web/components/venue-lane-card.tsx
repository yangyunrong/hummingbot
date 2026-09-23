"use client";
import type { VenueRuntime } from "../lib/api";
import { bps, money, pct } from "../lib/api";
import { DataFreshness } from "./data-freshness";

function metric(label: string, value: string) {
  return <div className="smallMetric"><div className="label">{label}</div><div className="value">{value}</div></div>;
}

function age(value: number) { return `${Math.round(value)} ms`; }

export function VenueLaneCard({ venue }: { venue: VenueRuntime }) {
  const makerRatio = venue.todayVolumeUsdt > 0 ? venue.makerVolumeUsdt / venue.todayVolumeUsdt : 0;
  const stateClass = venue.stale ? "warn" : venue.runtimeState === "RUNNING" ? "good" : "neutral";
  return (
    <article className="card" data-testid={`venue-${venue.venue}`}>
      <div className="venueHeader">
        <div>
          <div className="venueName">{venue.venue} CORE LINE</div>
          <DataFreshness ageMs={venue.sourceAgeMs} stale={venue.stale} />
        </div>
        <span className={`badge ${stateClass}`}>{venue.stale ? "STALE" : venue.runtimeState}</span>
      </div>
      <div className="venueMetrics">
        {metric("Volume Today", money(venue.todayVolumeUsdt))}
        {metric("Maker Ratio", pct(makerRatio))}
        {metric("Realized PnL", money(venue.realizedPnlUsdt))}
        {metric("Core Wear", bps(venue.coreWearBps))}
        {metric("Orders", `${venue.activeOrders} / ${venue.maxOrders}`)}
        {metric("Net Inventory", money(venue.netInventoryUsdt))}
        {metric("ACK p99", age(venue.latency.sendToAckP99Ms))}
        {metric("Coverage Deficit", money(venue.coverageDeficitUsdt))}
      </div>
      <div className="healthRow">
        <div className="healthPill">Public WS<b>{age(venue.publicWsAgeMs)}</b></div>
        <div className="healthPill">Private WS<b>{age(venue.privateWsAgeMs)}</b></div>
        <div className="healthPill">Truth<b>{age(venue.truthAgeMs)}</b></div>
        <div className="healthPill">Net Wear<b>{bps(venue.netWearBps)}</b></div>
      </div>
    </article>
  );
}
