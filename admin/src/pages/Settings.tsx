export default function Settings() {
  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Settings</h2>
      <p className="admin-page-subtitle">System configuration and maintenance controls.</p>

      <div className="admin-card-grid two-col">
        <article className="admin-card">
          <h3>System Configuration</h3>
          <label htmlFor="region">Primary Region</label>
          <select id="region" defaultValue="us-east-1">
            <option value="us-east-1">us-east-1</option>
            <option value="eu-west-1">eu-west-1</option>
            <option value="ap-southeast-1">ap-southeast-1</option>
          </select>

          <label htmlFor="maintenance">Maintenance Mode</label>
          <select id="maintenance" defaultValue="off">
            <option value="off">Off</option>
            <option value="read-only">Read-only</option>
            <option value="full">Full maintenance</option>
          </select>
        </article>

        <article className="admin-card">
          <h3>Feature Flags</h3>
          <label htmlFor="chatFlag">Chat Pipeline</label>
          <select id="chatFlag" defaultValue="enabled">
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>

          <label htmlFor="audioFlag">Audio Overrides</label>
          <select id="audioFlag" defaultValue="enabled">
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </article>

        <article className="admin-card">
          <h3>Storage</h3>
          <label htmlFor="retention">Log Retention (days)</label>
          <input id="retention" type="number" min={1} defaultValue={30} />

          <label htmlFor="backupWindow">Backup Window</label>
          <input id="backupWindow" type="text" defaultValue="02:00 UTC" />
        </article>

        <article className="admin-card">
          <h3>API Keys</h3>
          <label htmlFor="livekitKey">LiveKit Key</label>
          <input id="livekitKey" type="password" value="****************" readOnly />

          <label htmlFor="dbKey">Database Key</label>
          <input id="dbKey" type="password" value="****************" readOnly />
        </article>
      </div>

      <div className="admin-actions-row">
        <button className="admin-btn">Save Changes</button>
        <button className="admin-btn admin-btn-ghost">Backup Now</button>
      </div>
    </section>
  )
}
