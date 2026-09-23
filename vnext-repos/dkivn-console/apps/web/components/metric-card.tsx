export function MetricCard(props: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="metricLabel">{props.label}</div>
      <div className="metricValue">{props.value}</div>
      {props.sub ? <div className="metricSub">{props.sub}</div> : null}
    </div>
  );
}
