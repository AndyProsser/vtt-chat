/**
 * Group Card (Editor Mode)
 * Displays a single campaign group with options to delete and set environment.
 * Simple read-only card in editor mode; no drag/drop.
 */

import React from 'react'
import type { CampaignGroup } from '@/state/campaignGroupsSlice'
import { Icon } from '@/components/ui/Icon'

interface GroupCardProps {
  group: CampaignGroup
  onDelete: () => void
  onSetEnvironment: () => void
  onClearEnvironment: () => void
  isDeleting?: boolean
}

/**
 * Editor-mode group card.
 * Shows group name, default environment, and action buttons.
 */
const GroupCard: React.FC<GroupCardProps> = ({
  group,
  onDelete,
  onSetEnvironment,
  onClearEnvironment,
  isDeleting = false,
}) => {
  return (
    <article className="editor-group-card">
      <div className="editor-group-card__header">
        <div>
          <div className="editor-group-card__badge">
            <Icon name="group_work" />
            Group
          </div>
          <h3 className="editor-group-card__title">{group.name}</h3>
          <p className="editor-group-card__copy">
            Prepared outside session. Players only appear once a live session is running.
          </p>
        </div>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="editor-groups-button editor-groups-button--danger"
        >
          <Icon name="delete" />
          Delete
        </button>
      </div>

      <div className="editor-group-card__environment">
        <div>
          <p className="editor-group-card__environment-label">Default Environment</p>
          <p className="editor-group-card__environment-value">
            {group.defaultEnvironmentName || 'Default / None'}
          </p>
          <p className="editor-group-card__environment-copy">
            Applied when the group is restored into a live session.
          </p>
        </div>
        <div className="editor-group-card__actions">
          <button
            onClick={onSetEnvironment}
            className="editor-groups-button editor-groups-button--primary"
          >
            <Icon name="forest" />
            Set
          </button>
          {group.defaultEnvironmentName && (
            <button
              onClick={onClearEnvironment}
              className="editor-groups-button editor-groups-button--ghost"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="editor-group-card__footer">
        <p>Created {new Date(group.createdAt).toLocaleDateString()}</p>
        <p>Session planner only</p>
      </div>
    </article>
  )
}

export default GroupCard
