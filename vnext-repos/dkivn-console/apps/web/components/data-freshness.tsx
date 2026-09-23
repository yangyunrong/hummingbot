export function DataFreshness({ ageMs, stale }: { ageMs: number; stale: boolean }) {
  return (
    <span className="freshness">
      {stale ? "STALE · " : ""}
      source {Math.max(0, Math.round(ageMs))} ms ago
    </span>
  );
}
