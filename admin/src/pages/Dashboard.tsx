import { useState } from 'react'
import { useAuthStore } from '../store'
import UserManagement from './UserManagement'
import CampaignManagement from './CampaignManagement'
import PlatformStatus from './PlatformStatus'
import Analytics from './Analytics'
import Logs from './Logs'
import '../styles/Dashboard.css'

type Page = 'overview' | 'users' | 'campaigns' | 'status' | 'analytics' | 'logs'

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<Page>('overview')
  const { logout } = useAuthStore()

  const renderPage = () => {
    switch (currentPage) {
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
        return <Overview />
    }
  }

  return (
    <div className="dashboard">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>Admin</h2>
        </div>
        <ul className="nav-menu">
          <li>
            <button
              className={currentPage === 'overview' ? 'active' : ''}
              onClick={() => setCurrentPage('overview')}
            >
              📊 Overview
            </button>
          </li>
          <li>
            <button
              className={currentPage === 'users' ? 'active' : ''}
              onClick={() => setCurrentPage('users')}
            >
              👥 Users
            </button>
          </li>
          <li>
            <button
              className={currentPage === 'campaigns' ? 'active' : ''}
              onClick={() => setCurrentPage('campaigns')}
            >
              📜 Campaigns
            </button>
          </li>
          <li>
            <button
              className={currentPage === 'status' ? 'active' : ''}
              onClick={() => setCurrentPage('status')}
            >
              ⚙️ Platform Status
            </button>
          </li>
          <li>
            <button
              className={currentPage === 'analytics' ? 'active' : ''}
              onClick={() => setCurrentPage('analytics')}
            >
              📈 Analytics
            </button>
          </li>
          <li>
            <button
              className={currentPage === 'logs' ? 'active' : ''}
              onClick={() => setCurrentPage('logs')}
            >
              📝 Logs
            </button>
          </li>
        </ul>
        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </nav>

      <main className="main-content">{renderPage()}</main>
    </div>
  )
}

function Overview() {
  return (
    <div className="page">
      <h1>Dashboard Overview</h1>
      <div className="overview-grid">
        <div className="stat-card">
          <h3>Total Users</h3>
          <p className="stat-value">-</p>
          <small>Active players & DMs</small>
        </div>
        <div className="stat-card">
          <h3>Active Campaigns</h3>
          <p className="stat-value">-</p>
          <small>Running sessions</small>
        </div>
        <div className="stat-card">
          <h3>Platform Status</h3>
          <p className="stat-value status-ok">●</p>
          <small>All systems operational</small>
        </div>
        <div className="stat-card">
          <h3>API Health</h3>
          <p className="stat-value status-ok">●</p>
          <small>Backend responding</small>
        </div>
      </div>
      <p className="info-text" style={{ marginTop: '2rem' }}>
        Use the navigation menu to manage users, campaigns, view platform status, analytics, and logs.
      </p>
    </div>
  )
}
