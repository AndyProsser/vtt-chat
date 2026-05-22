import { Icon } from '@/components/ui/Icon'

type CampaignScaffoldPanelProps = {
  title: string
  subtitle: string
  sections: string[]
  campaignName?: string
}

export function CampaignScaffoldPanel(props: CampaignScaffoldPanelProps) {
  return (
    <section className="session-campaign-scaffold" aria-label={props.title}>
      <header className="session-campaign-scaffold__header">
        <h4 className="session-campaign-scaffold__title">
          <Icon name="panel" />
          {props.title}
        </h4>
        <p className="session-campaign-scaffold__subtitle">{props.subtitle}</p>
      </header>

      <p className="session-campaign-scaffold__context">
        Campaign context: {props.campaignName || 'Campaign'}
      </p>

      <ul className="session-campaign-scaffold__list">
        {props.sections.map((section) => (
          <li key={section}>{section}</li>
        ))}
      </ul>
    </section>
  )
}
