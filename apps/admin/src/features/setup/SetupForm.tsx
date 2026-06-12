import React from 'react'
import PasswordStrengthIndicator from '../../components/PasswordStrengthIndicator'

interface PasswordValidation {
  isValid: boolean
  score: number
  feedback: string[]
  suggestions: string[]
}

interface SetupFormProps {
  loading: boolean
  formData: {
    email: string
    username: string
    password: string
    passwordConfirm: string
  }
  errors: Record<string, string>
  passwordValidation: PasswordValidation
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onPasswordChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export default function SetupForm({
  loading,
  formData,
  errors,
  passwordValidation,
  onSubmit,
  onInputChange,
  onPasswordChange,
}: SetupFormProps) {
  return (
    <div className="setup-wizard">
      <div className="setup-form-container">
        <h1>Create Sysadmin Account</h1>
        <p className="setup-form-subtitle">
          Set up your admin credentials. Use a strong, unique password.
        </p>

        {errors.form && <div className="error-alert">{errors.form}</div>}

        <form onSubmit={onSubmit} className="setup-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={onInputChange}
              placeholder="admin@example.com"
              required
              autoComplete="email"
              className={errors.email ? 'input-error' : ''}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={onInputChange}
              placeholder="admin"
              required
              autoComplete="username"
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
              onChange={onPasswordChange}
              placeholder="Enter a strong password"
              required
              autoComplete="new-password"
              className={errors.password ? 'input-error' : ''}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <PasswordStrengthIndicator
            password={formData.password}
            feedback={passwordValidation.feedback}
            suggestions={passwordValidation.suggestions}
            score={passwordValidation.score}
            isValid={passwordValidation.isValid}
          />

          <div className="form-group">
            <label htmlFor="passwordConfirm">Confirm Password</label>
            <input
              type="password"
              id="passwordConfirm"
              name="passwordConfirm"
              value={formData.passwordConfirm}
              onChange={onInputChange}
              placeholder="Re-enter password"
              required
              autoComplete="new-password"
              className={errors.passwordConfirm ? 'input-error' : ''}
            />
            {errors.passwordConfirm && (
              <span className="field-error">{errors.passwordConfirm}</span>
            )}
          </div>

          <button type="submit" className="admin-btn admin-btn-primary" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Admin Account'}
          </button>
        </form>

        <p className="setup-tip">
          Tip: Use a password manager like 1Password, Bitwarden, or LastPass to generate a strong
          password automatically.
        </p>
      </div>
    </div>
  )
}
