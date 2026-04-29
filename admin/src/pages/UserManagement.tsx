import { Alert, Box, Typography } from '@mui/material'
import { AdminPagination } from '../components/AdminPagination'
import { UserFilters } from '../features/users/UserFilters'
import { UserInvitePanel } from '../features/users/UserInvitePanel'
import { UserTable } from '../features/users/UserTable'
import { useUserManagement } from '../features/users/useUserManagement'

export default function UserManagement() {
  const {
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    rows,
    total,
    totalPages,
    loading,
    error,
    actionBusyUserId,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    inviteUrl,
    creatingInvite,
    runAction,
    createInvite,
  } = useUserManagement()

  return (
    <Box component="section" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h5">Users</Typography>
      <Typography variant="body2" color="text.secondary">
        Search, filter, and moderate user accounts.
      </Typography>

      {loading && <Alert severity="info">Loading users...</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <UserFilters
        search={search}
        roleFilter={roleFilter}
        statusFilter={statusFilter}
        pageSize={pageSize}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        onRoleFilterChange={(value) => {
          setRoleFilter(value)
          setPage(1)
        }}
        onStatusFilterChange={(value) => {
          setStatusFilter(value)
          setPage(1)
        }}
        onPageSizeChange={(value) => {
          setPageSize(value)
          setPage(1)
        }}
      />

      <UserInvitePanel
        inviteEmail={inviteEmail}
        inviteRole={inviteRole}
        inviteUrl={inviteUrl}
        creatingInvite={creatingInvite}
        onInviteEmailChange={setInviteEmail}
        onInviteRoleChange={setInviteRole}
        onCreateInvite={() => void createInvite()}
      />

      <Typography variant="body2" color="text.secondary">
        Showing {rows.length} of {total} users (page {page}/{totalPages})
      </Typography>

      <UserTable
        rows={rows}
        actionBusyUserId={actionBusyUserId}
        onRunAction={(userId, method, path, reason) => void runAction(userId, method, path, reason)}
      />

      <AdminPagination
        page={page}
        totalPages={totalPages}
        loading={loading}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
      />
    </Box>
  )
}
