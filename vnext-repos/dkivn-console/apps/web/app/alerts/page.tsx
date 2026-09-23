"use client";
import { useEffect, useState } from "react";
import { AlertList } from "../../components/alert-list";
import { api, type AlertView } from "../../lib/api";

export default function AlertsPage() {
  const [rows, setRows] = useState<AlertView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.alerts().then(setRows).catch(e => setError(String(e))); }, []);
  return <main>
    <div className="pageTitle"><div><h1>Alert Center</h1><p>One incident source shared by Console and Telegram</p></div></div>
    {error ? <div className="error">Control API unavailable: {error}</div> : null}
    {rows === null ? <div className="skeleton" /> : <AlertList alerts={rows} />}
  </main>;
}
