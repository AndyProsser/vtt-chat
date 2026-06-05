import { useEffect, useId, useRef, useState } from 'react'

interface DmdxTimelineBlockProps {
  rawContent: string
}

/**
 * Renders a Mermaid timeline diagram with a plain-text fallback.
 * Mermaid is loaded lazily to avoid bloating the initial bundle.
 * If Mermaid fails to parse or render, the raw lines are shown instead.
 */
export function DmdxTimelineBlock({ rawContent }: DmdxTimelineBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'rendered' | 'fallback'>('loading')
  const uId = useId()
  const diagramId = `dmdx-timeline-${uId.replace(/:/g, '')}`

  useEffect(() => {
    let cancelled = false

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })

        const content = rawContent.trim()
        // Wrap in a timeline/flowchart block if not already wrapped
        const diagram = content.startsWith('timeline') ? content : `flowchart LR\n${content}`

        const { svg } = await mermaid.render(diagramId, diagram)

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setStatus('rendered')
        }
      } catch {
        if (!cancelled) {
          setStatus('fallback')
        }
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [rawContent, diagramId])

  const plainLines = rawContent.trim().split('\n').filter(Boolean)

  return (
    <div className="dmdx-block dmdx-block--timeline">
      <div className="dmdx-block__header">
        <span className="material-symbols-outlined dmdx-timeline__icon" aria-hidden="true">
          timeline
        </span>
        <span className="dmdx-block__type-label">Timeline</span>
      </div>

      {status === 'rendered' ? (
        <div ref={containerRef} className="dmdx-timeline__diagram" />
      ) : status === 'fallback' ? (
        <div ref={containerRef} className="dmdx-timeline__fallback">
          {plainLines.map((line, i) => (
            <p key={i} className="dmdx-timeline__fallback-line">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <div className="dmdx-timeline__diagram" ref={containerRef}>
          {/* loading */}
        </div>
      )}
    </div>
  )
}
