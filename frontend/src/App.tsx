type BaselineArea = {
	id: string
	title: string
	description: string
}

const subsystemAreas: BaselineArea[] = [
	{
		id: 'chat',
		title: 'Chat System',
		description: 'IC, OOC, whispers, and system messaging will be implemented in later stages.',
	},
	{
		id: 'notes',
		title: 'Notes System',
		description: 'Private, shared, and DM-only notes are intentionally disabled in this baseline.',
	},
	{
		id: 'audio',
		title: 'Audio Engine',
		description: 'Audio effects, presets, and DM overrides are currently placeholders.',
	},
	{
		id: 'presence',
		title: 'Presence State',
		description: 'Typing, speaking, and online indicators will be connected in future stages.',
	},
	{
		id: 'session',
		title: 'Session Lifecycle',
		description: 'Idle, active, paused, and ended transitions are not yet interactive.',
	},
]

export default function App() {
	return (
		<main
			style={{
				maxWidth: '980px',
				margin: '0 auto',
				padding: '2rem 1rem 3rem',
				fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
			}}
		>
			<header style={{ marginBottom: '1.5rem' }}>
				<h1 style={{ marginBottom: '0.5rem' }}>VTT-Chat Frontend Baseline</h1>
				<p style={{ margin: 0, color: '#475569' }}>
					Non-functional scaffold aligned to event-driven architecture and role-aware design.
				</p>
			</header>

			<section
				aria-label="Architecture flow"
				style={{
					border: '1px solid #e2e8f0',
					borderRadius: '12px',
					padding: '1rem',
					background: '#f8fafc',
					marginBottom: '1rem',
				}}
			>
				<strong>Event flow:</strong> UI -&gt; Event -&gt; Reducer -&gt; Store -&gt; UI
			</section>

			<section
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
					gap: '0.75rem',
				}}
			>
				{subsystemAreas.map((area) => (
					<article
						key={area.id}
						style={{
							border: '1px solid #e2e8f0',
							borderRadius: '12px',
							padding: '0.9rem',
							background: '#ffffff',
						}}
					>
						<h2 style={{ fontSize: '1rem', marginTop: 0 }}>{area.title}</h2>
						<p style={{ marginBottom: 0, color: '#334155', fontSize: '0.95rem' }}>
							{area.description}
						</p>
					</article>
				))}
			</section>
		</main>
	)
}
