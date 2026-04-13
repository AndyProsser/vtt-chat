import { useState, useEffect } from 'react'
import '../styles/Page.css'

interface User {
  id: string
  username: string
  email: string
  role: 'player' | 'dm'
  createdAt: string
  lastActive: string | null
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/admin/api/users')
      if (!response.ok) throw new Error('Failed to fetch users')
      const data = await response.json()
      setUsers(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading users')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="page"><p>Loading users...</p></div>
  if (error) return <div className="page error">{error}</div>

  return (
    <div className="page">
      <h1>User Management</h1>
      <p className="info-text">
        View and manage all registered players and DMs on the platform.
      </p>

      {users.length === 0 ? (
        <p className="empty-state">No users registered yet</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.email || '-'}</td>
                  <td><span className={`role-badge role-${user.role}`}>{user.role}</span></td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>{user.lastActive ? new Date(user.lastActive).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <button onClick={fetchUsers} className="btn btn-primary">
          Refresh
        </button>
      </div>
    </div>
  )
}
