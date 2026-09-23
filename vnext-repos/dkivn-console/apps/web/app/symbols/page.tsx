"use client";
import { useEffect, useState } from "react";
import { SymbolsTable } from "../../components/symbols-table";
import { api, type SymbolRuntime } from "../../lib/api";

export default function SymbolsPage() {
  const [rows, setRows] = useState<SymbolRuntime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.symbols().then(setRows).catch(e => setError(String(e))); }, []);
  return <main>
    <div className="pageTitle"><div><h1>Symbols Operating Table</h1><p>Orders, inventory, EV, toxicity and markout by venue/symbol</p></div></div>
    {error ? <div className="error">Control API unavailable: {error}</div> : null}
    {rows === null ? <div className="skeleton" /> : <SymbolsTable rows={rows} />}
  </main>;
}
