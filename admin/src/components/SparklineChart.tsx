interface SparklinePoint {
  x: number
  y: number
}

interface SparklineChartProps {
  points: SparklinePoint[]
  colorClassName?: string
  valueSuffix?: string
  emptyLabel?: string
}

function buildPolyline(points: SparklinePoint[], width: number, height: number): string {
  if (!points.length) {
    return ''
  }

  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const yRange = maxY - minY || 1
  const xRange = Math.max(points.length - 1, 1)

  return points
    .map((point, index) => {
      const x = (index / xRange) * width
      const normalizedY = (point.y - minY) / yRange
      const y = height - normalizedY * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function SparklineChart({
  points,
  colorClassName = '',
  valueSuffix = '',
  emptyLabel = 'No data',
}: SparklineChartProps) {
  const latestValue = points.length ? points[points.length - 1].y : null
  const polyline = buildPolyline(points, 100, 36)

  return (
    <div className="sparkline-chart">
      <div className="sparkline-chart-viewport" aria-hidden="true">
        {points.length ? (
          <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="sparkline-chart-svg">
            <polyline
              className={`sparkline-chart-line ${colorClassName}`.trim()}
              points={polyline}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="sparkline-chart-empty">{emptyLabel}</div>
        )}
      </div>
      <p className="sparkline-chart-value">
        {latestValue === null ? emptyLabel : `Latest: ${latestValue}${valueSuffix}`}
      </p>
    </div>
  )
}
