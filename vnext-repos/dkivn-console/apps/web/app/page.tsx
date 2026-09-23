"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertList } from "../components/alert-list";
import { MetricCard } from "../components/metric-card";
import { VenueLaneCard } from "../components/venue-lane-card";
import { api, bps, money, pct, type AlertView, type VenueRuntime } from "../lib/api";

export default function OverviewPage() {
  const [venues, setVenues] = useState<VenueRuntime[] | null>(null);
  const [alerts, setAlerts] = useState<AlertView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.venues(), api.activeAlerts()])
      .then(([venueRows, alertRows]) => { setVenues(venueRows); setAlerts(alertRows); })
      .catch(err => setError(err instanceof Error ? err.message : "Unknown API error"));
  }, []);

  const kpi = useMemo(() => {
    if (!venues?.length) return null;
    const volume = venues.reduce((sum, x) => sum + x.todayVolumeUsdt, 0);
    const maker = venues.reduce((sum, x) => sum + x.makerVolumeUsdt, 0);
    const pnl = venues.reduce((sum, x) => sum + x.realizedPnlUsdt, 0);
    const rebate = venues.reduce((sum, x) => sum + x.rebateUsdt, 0);
    const weightedCore = volume > 0 ? venues.reduce((sum, x) => sum + x.coreWearBps * x.todayVolumeUsdt, 0) / volume : 0;
    const weightedNet = volume > 0 ? venues.reduce((sum, x) => sum + x.netWearBps * x.todayVolumeUsdt, 0) / volume : 0;
    return {
      volume, pnl, rebate, makerRatio: volume > 0 ? maker / volume : 0,
      coreWear: weightedCore, netWear: weightedNet,
      eventLoop: Math.max(...venues.map(v => v.latency.eventLoopP99Ms)),
      gc: Math.max(...venues.map(v => v.latency.gcPauseP99Ms)),
    };
  }, [venues]);

  return (
    <main>
      <div className="pageTitle"><div><h1>System Overview</h1><p>Real engine telemetry only · no UI-derived trading truth</p></div></div>
      {error ? <div className="error">Control API unavailable: {error}</div> : null}
      {venues === null ? <div className="skeleton" /> : venues.length === 0 ? <div className="empty">No runtime data</div> : (
        <>
          <div className="grid kpiGrid">
            <MetricCard label="Total Equity" value="—" sub="Not available in Phase 1 runtime contract" />
            <MetricCard label="Today Realized PnL" value={money(kpi?.pnl)} sub="Sum of venue truth" />
            <MetricCard label="Today Volume" value={money(kpi?.volume)} sub={`Maker ${pct(kpi?.makerRatio)}`} />
            <MetricCard label="Rebate Accrued" value={money(kpi?.rebate)} />
            <MetricCard label="Net Wear" value={bps(kpi?.netWear)} sub="Volume weighted" />
            <MetricCard label="Core Wear" value={bps(kpi?.coreWear)} sub="Excludes rebate" />
            <MetricCard label="Event Loop p99" value={kpi ? `${kpi.eventLoop.toFixed(2)} ms` : "—"} />
            <MetricCard label="GC Pause p99" value={kpi ? `${kpi.gc.toFixed(2)} ms` : "—"} />
          </div>
          <div className="grid venueGrid">{venues.map(v => <VenueLaneCard key={v.venue} venue={v} />)}</div>
        </>
      )}
      <div className="sectionHeader"><h2>Active Alerts</h2><span className="muted">{alerts?.length ?? "—"} incidents</span></div>
      {alerts === null ? <div className="skeleton" /> : <AlertList alerts={alerts} />}
    </main>
  );
}
