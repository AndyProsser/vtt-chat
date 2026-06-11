interface TelemetryMetricCardProps {
  title: string
  value: string | number
  subtitle?: string
}

export function TelemetryMetricCard({ title, value, subtitle }: TelemetryMetricCardProps) {
  return (
    <article className="admin-card metric">
      <h3>{title}</h3>
      <p className="metric-value">{value}</p>
      {subtitle ? <small>{subtitle}</small> : null}
    </article>
  )
}
