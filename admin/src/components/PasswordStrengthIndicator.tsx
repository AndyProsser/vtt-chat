import React from 'react'

interface PasswordStrengthIndicatorProps {
  password: string
  feedback: string[]
  suggestions: string[]
  score: number
  isValid: boolean
}

const STRENGTH_COLORS = ['#dc2626', '#f59e0b', '#eab308', '#84cc16', '#22c55e']
const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong']

export default function PasswordStrengthIndicator({
  password,
  feedback,
  suggestions,
  score,
  isValid,
}: PasswordStrengthIndicatorProps) {
  if (!password) {
    return (
      <div className="password-strength">
        <p className="password-help-text">
          Create a secure password with at least 12 characters including uppercase, lowercase,
          numbers, and special characters.
        </p>
      </div>
    )
  }

  return (
    <div className="password-strength">
      <div className="password-meter">
        <div
          className="password-meter-bar"
          style={{
            width: `${(score / 5) * 100}%`,
            backgroundColor: STRENGTH_COLORS[Math.min(score, 4)],
          }}
        />
      </div>
      <p className="password-strength-label" style={{ color: STRENGTH_COLORS[Math.min(score, 4)] }}>
        Strength: {STRENGTH_LABELS[Math.min(score, 4)]}
      </p>

      {feedback.length > 0 && (
        <div className="password-feedback">
          <p className="password-feedback-label">Requirements:</p>
          <ul className="password-feedback-list">
            {feedback.map((item, idx) => (
              <li key={idx} className="feedback-item error">
                ✗ {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isValid && (
        <div className="password-feedback success">
          <p className="password-feedback-label">✓ Password meets all requirements</p>
        </div>
      )}

      {suggestions.length > 0 && !isValid && (
        <div className="password-suggestions">
          <p className="password-suggestions-label">Tips:</p>
          <ul className="password-suggestions-list">
            {suggestions.slice(0, 2).map((suggestion, idx) => (
              <li key={idx} className="suggestion-item">
                💡 {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
