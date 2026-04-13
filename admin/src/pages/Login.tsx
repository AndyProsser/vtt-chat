import { useState } from 'react'
import { useAuthStore } from '../store'
import '../styles/Login.css'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { login, loading, error } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(username, password)
    } catch {
      // Error is handled by store
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>VTT-Chat Admin</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
