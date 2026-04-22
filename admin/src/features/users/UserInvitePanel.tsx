import type { InviteRole } from './types'

interface UserInvitePanelProps {
  inviteEmail: string
  inviteRole: InviteRole
  inviteUrl: string | null
  creatingInvite: boolean
  onInviteEmailChange: (value: string) => void
  onInviteRoleChange: (value: InviteRole) => void
  onCreateInvite: () => void
}

export function UserInvitePanel({
  inviteEmail,
  inviteRole,
  inviteUrl,
  creatingInvite,
  onInviteEmailChange,
  onInviteRoleChange,
  onCreateInvite,
}: UserInvitePanelProps) {
  return (
    <section className="admin-card">
      <h3>Create Admin Invite</h3>
      <p className="admin-page-subtitle">Invite non-existing users with scoped admin access.</p>
      <div className="admin-toolbar-row wrap">
        <input
          type="email"
          placeholder="Optional email restriction"
          aria-label="Invite email"
          value={inviteEmail}
          onChange={(event) => onInviteEmailChange(event.target.value)}
        />
        <select
          value={inviteRole}
          onChange={(event) => onInviteRoleChange(event.target.value as InviteRole)}
        >
          <option value="ADMIN">ADMIN</option>
          <option value="CAMPAIGN_DM">CAMPAIGN_DM</option>
          <option value="READ_ONLY">READ_ONLY</option>
        </select>
        <button className="admin-btn" onClick={onCreateInvite} disabled={creatingInvite}>
          {creatingInvite ? 'Creating...' : 'Generate Invite Link'}
        </button>
      </div>
      {inviteUrl && (
        <div className="admin-card admin-card-nested">
          <p className="admin-page-subtitle">Invite URL</p>
          <p>{inviteUrl}</p>
        </div>
      )}
    </section>
  )
}
