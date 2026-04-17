export default function UserManagement() {
  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Users</h2>
      <p className="admin-page-subtitle">Search, filter, and moderate user accounts.</p>

      <div className="admin-toolbar-row">
        <input type="search" placeholder="Search username or email" aria-label="Search users" />
        <select aria-label="Filter by role" defaultValue="all">
          <option value="all">All roles</option>
          <option value="dm">DM</option>
          <option value="player">Player</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last Active</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>dm_alex</td>
              <td>alex@example.com</td>
              <td>DM</td>
              <td>2 min ago</td>
              <td>Active</td>
              <td>
                <div className="cell-actions">
                  <button className="admin-btn admin-btn-ghost">View</button>
                  <button className="admin-btn admin-btn-ghost">Suspend</button>
                </div>
              </td>
            </tr>
            <tr>
              <td>player_mira</td>
              <td>mira@example.com</td>
              <td>Player</td>
              <td>11 min ago</td>
              <td>Active</td>
              <td>
                <div className="cell-actions">
                  <button className="admin-btn admin-btn-ghost">View</button>
                  <button className="admin-btn admin-btn-ghost">Force Logout</button>
                </div>
              </td>
            </tr>
            <tr>
              <td>spectator_jen</td>
              <td>jen@example.com</td>
              <td>Spectator</td>
              <td>1 hr ago</td>
              <td>Suspended</td>
              <td>
                <div className="cell-actions">
                  <button className="admin-btn admin-btn-ghost">View</button>
                  <button className="admin-btn">Restore</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
