"use client";
import { useEffect, useState } from "react";
import { VenueLaneCard } from "../../components/venue-lane-card";
import { api, type VenueRuntime } from "../../lib/api";

export default function VenuesPage() {
  const [rows, setRows] = useState<VenueRuntime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.venues().then(setRows).catch(e => setError(String(e))); }, []);
  return <main>
    <div className="pageTitle"><div><h1>Execution Lanes</h1><p>Toobit and Bitget are independent fault domains</p></div></div>
    {error ? <div className="error">Control API unavailable: {error}</div> : null}
    {rows === null ? <div className="skeleton" /> : rows.length === 0 ? <div className="empty">No runtime data</div> :
      <div className="grid venueGrid">{rows.map(v => <VenueLaneCard key={v.venue} venue={v} />)}</div>}
  </main>;
}
