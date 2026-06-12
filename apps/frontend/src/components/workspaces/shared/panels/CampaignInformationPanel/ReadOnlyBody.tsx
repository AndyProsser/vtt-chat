import type { CampaignInformationReadOnlyBodyProps } from '@/types/campaignInformationPanel'

/**
 * Read-only campaign metadata body shown when editing is not active.
 */
export function CampaignInformationReadOnlyBody({
  campaignName,
  campaignDescription,
  currentPoster,
  statusLine,
}: CampaignInformationReadOnlyBodyProps) {
  return (
    <>
      <p className="cip-name-value">{campaignName}</p>
      <p className="cip-description">{campaignDescription || 'No description provided.'}</p>

      {statusLine}

      <div className="cip-poster-controls">
        <span className="cip-field-label">Poster image</span>
        <div
          className={`cip-poster-surface ${currentPoster ? 'has-image' : ''}`}
          style={currentPoster ? { backgroundImage: `url(${currentPoster})` } : undefined}
          aria-hidden="true"
        >
          {!currentPoster ? (
            <div className="cip-poster__placeholder">{campaignName.charAt(0).toUpperCase()}</div>
          ) : null}
        </div>
      </div>
    </>
  )
}
