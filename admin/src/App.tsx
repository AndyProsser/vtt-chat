import { useState, useEffect } from 'react'
import { useAuthStore } from './store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import './styles/App.css'

export default function App() {
  const { isAuthenticated, initializeAuth } = useAuthStore()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    initializeAuth()
    setInitialized(true)
  }, [initializeAuth])

  if (!initialized) {
    return <div className="loading">Initializing...</div>
  }

  return isAuthenticated ? <Dashboard /> : <Login />
}
