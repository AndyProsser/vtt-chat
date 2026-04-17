export default function CampaignManagement() {
  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Rooms & Campaigns</h2>
      <p className="admin-page-subtitle">
        Operational visibility into room activity and campaign state.
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Room Name</th>
              <th>Campaign</th>
              <th>Players</th>
              <th>Environment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Main Tavern</td>
              <td>Ashfall</td>
              <td>5</td>
              <td>Tavern Interior</td>
              <td>Active</td>
              <td>
                <div className="cell-actions">
                  <button className="admin-btn admin-btn-ghost">View</button>
                  <button className="admin-btn admin-btn-ghost">Move Players</button>
                </div>
              </td>
            </tr>
            <tr>
              <td>War Room</td>
              <td>Iron Reach</td>
              <td>3</td>
              <td>Stone Hall</td>
              <td>Idle</td>
              <td>
                <div className="cell-actions">
                  <button className="admin-btn admin-btn-ghost">View</button>
                  <button className="admin-btn admin-btn-ghost">Close</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="admin-card">
        <h3>Selected Room Detail</h3>
        <div className="kv-grid">
          <div>
            <strong>Players:</strong> 5
          </div>
          <div>
            <strong>Audio Settings:</strong> Tavern preset
          </div>
          <div>
            <strong>Notes Count:</strong> 22
          </div>
          <div>
            <strong>Chat Volume:</strong> 486 messages/day
          </div>
        </div>
      </section>
    </section>
  )
}
