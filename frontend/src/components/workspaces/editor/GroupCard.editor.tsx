/**
 * Group Card (Editor Mode)
 * Displays a single campaign group with options to delete and set environment.
 * Simple read-only card in editor mode; no drag/drop.
 */

import React from 'react'
import type { CampaignGroup } from '@/state/campaignGroupsSlice'

interface GroupCardEditorProps {
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
const GroupCardEditor: React.FC<GroupCardEditorProps> = ({
  group,
  onDelete,
  onSetEnvironment,
  onClearEnvironment,
  isDeleting = false,
}) => {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_48px_rgba(2,6,23,0.25)] transition hover:border-slate-700 hover:bg-slate-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              group_work
            </span>
            Group
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-100">{group.name}</h3>
          <p className="mt-1 text-sm text-slate-400">
            Prepared outside session. Players only appear once a live session is running.
          </p>
        </div>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex items-center gap-1 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15 disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            delete
          </span>
          Delete
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Default Environment
          </p>
          <p className="mt-2 text-base font-medium text-slate-100">
            {group.defaultEnvironmentName || 'Default / None'}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Applied when the group is restored into a live session.
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <button
            onClick={onSetEnvironment}
            className="inline-flex items-center gap-1 rounded-xl bg-cyan-400/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              forest
            </span>
            Set
          </button>
          {group.defaultEnvironmentName && (
            <button
              onClick={onClearEnvironment}
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-500">
        <p>Created {new Date(group.createdAt).toLocaleDateString()}</p>
        <p>Session planner only</p>
      </div>
    </div>
  )
}

export default GroupCardEditor
