import { useState, useEffect } from 'react'
import '../styles/Page.css'

interface Campaign {
  id: string
  name: string
  description: string
  dmId: string
  dmName: string
  playerCount: number
  createdAt: string
  archived: boolean
}

export default function CampaignManagement() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const response = await fetch('/admin/api/campaigns')
      if (!response.ok) throw new Error('Failed to fetch campaigns')
      const data = await response.json()
      setCampaigns(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading campaigns')
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async (campaignId: string) => {
    try {
      const response = await fetch(`/admin/api/campaigns/${campaignId}/archive`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to archive campaign')
      await fetchCampaigns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error archiving campaign')
    }
  }

  const handleExport = async (campaignId: string) => {
    try {
      const response = await fetch(`/admin/api/campaigns/${campaignId}/export`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `campaign_${campaignId}.json`
      a.click()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error exporting campaign')
    }
  }

  const handleDelete = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This cannot be undone.')) {
      return
    }
    try {
      const response = await fetch(`/admin/api/campaigns/${campaignId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete campaign')
      await fetchCampaigns()
      setSelectedCampaign(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting campaign')
    }
  }

  if (loading) return <div className="page"><p>Loading campaigns...</p></div>
  if (error) return <div className="page error">{error}</div>

  return (
    <div className="page">
      <h1>Campaign Management</h1>
      <p className="info-text">
        Archive, export, import, or delete campaigns.
      </p>

      {campaigns.length === 0 ? (
        <p className="empty-state">No campaigns found</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Campaign Name</th>
                <th>DM</th>
                <th>Players</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <button
                      className="link-btn"
                      onClick={() => setSelectedCampaign(campaign)}
                    >
                      {campaign.name}
                    </button>
                  </td>
                  <td>{campaign.dmName}</td>
                  <td>{campaign.playerCount}</td>
                  <td>{new Date(campaign.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`status-badge ${campaign.archived ? 'archived' : 'active'}`}>
                      {campaign.archived ? 'Archived' : 'Active'}
                    </span>
                  </td>
                  <td className="action-buttons">
                    {!campaign.archived && (
                      <button
                        className="btn btn-small"
                        onClick={() => handleArchive(campaign.id)}
                      >
                        Archive
                      </button>
                    )}
                    <button
                      className="btn btn-small"
                      onClick={() => handleExport(campaign.id)}
                    >
                      Export
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(campaign.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCampaign && (
        <div className="modal-overlay" onClick={() => setSelectedCampaign(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedCampaign.name}</h2>
            <p>{selectedCampaign.description}</p>
            <div className="modal-details">
              <div><strong>DM:</strong> {selectedCampaign.dmName}</div>
              <div><strong>Players:</strong> {selectedCampaign.playerCount}</div>
              <div><strong>Created:</strong> {new Date(selectedCampaign.createdAt).toLocaleString()}</div>
              <div><strong>Status:</strong> {selectedCampaign.archived ? 'Archived' : 'Active'}</div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setSelectedCampaign(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <button onClick={fetchCampaigns} className="btn btn-primary">
          Refresh
        </button>
      </div>
    </div>
  )
}
