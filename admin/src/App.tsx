import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import CampaignManagement from './pages/CampaignManagement'
import PlatformStatus from './pages/PlatformStatus'
import Analytics from './pages/Analytics'
import Logs from './pages/Logs'
import './styles/App.css'

type AdminPage = 'dashboard' | 'users' | 'campaigns' | 'status' | 'analytics' | 'logs'

export default function App() {
  const [page, setPage] = useState<AdminPage>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'users':
        return <UserManagement />
      case 'campaigns':
        return <CampaignManagement />
      case 'status':
        return <PlatformStatus />
      case 'analytics':
        return <Analytics />
      case 'logs':
        return <Logs />
      default:
        return <Dashboard />
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '980px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginBottom: '0.4rem' }}>VTT-Chat Admin Baseline</h1>
        <p style={{ margin: 0, color: '#475569' }}>
          Non-functional scaffold for staged implementation.
        </p>
      </header>

      <nav
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
        aria-label="Admin baseline navigation"
      >
        <button onClick={() => setPage('dashboard')}>Dashboard</button>
        <button onClick={() => setPage('users')}>Users</button>
        <button onClick={() => setPage('campaigns')}>Campaigns</button>
        <button onClick={() => setPage('status')}>Status</button>
        <button onClick={() => setPage('analytics')}>Analytics</button>
        <button onClick={() => setPage('logs')}>Logs</button>
      </nav>

      {renderPage()}
    </div>
  )
}
