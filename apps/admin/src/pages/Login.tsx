import React, { useState } from 'react'
import { API_BASE } from '../utils/api'

interface LoginProps {
  onLoginSuccess: (token: string, admin: { id: string; username: string; email: string }) => void
  onError: (error: string) => void
}

export default function Login({ onLoginSuccess, onError }: LoginProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [rememberMe, setRememberMe] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.username) {
      newErrors.username = 'Username is required'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        const errorMsg = data.error || 'Login failed'
        setErrors({ form: errorMsg })
        onError(errorMsg)
        setLoading(false)
        return
      }

      const data = await response.json()

      // Store token in localStorage or sessionStorage
      const storageKey = 'admin-token'
      if (rememberMe) {
        localStorage.setItem(storageKey, data.token)
      } else {
        sessionStorage.setItem(storageKey, data.token)
      }

      onLoginSuccess(data.token, data.admin)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      setErrors({ form: message })
      onError(message)
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-form-wrapper">
        <div className="login-header">
          <h1>VTT-Chat Admin</h1>
          <p>Operations Console</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>Admin Login</h2>

          {errors.form && <div className="error-alert">{errors.form}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              placeholder="Enter your username"
              required
              autoComplete="username"
              autoFocus
              className={errors.username ? 'input-error' : ''}
            />
            {errors.username && <span className="field-error">{errors.username}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className={errors.password ? 'input-error' : ''}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <div className="form-checkbox">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <label htmlFor="rememberMe">Remember me on this device</label>
          </div>

          <button type="submit" className="admin-btn admin-btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="login-tip">
          This is a secure admin area. Only authorized administrators can access this console.
        </p>
      </div>
    </div>
  )
}
