import React from 'react'

interface PasswordStrengthIndicatorProps {
  password: string
  feedback: string[]
  suggestions: string[]
  score: number
  isValid: boolean
}

const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong']

export default function PasswordStrengthIndicator({
  password,
  feedback,
  suggestions,
  score,
  isValid,
}: PasswordStrengthIndicatorProps) {
  const normalizedScore = Math.max(0, Math.min(score, 5))
  const strengthLevel = Math.min(normalizedScore, 4)

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
          className={`password-meter-bar fill-${normalizedScore} strength-${strengthLevel}`}
          aria-hidden="true"
        />
      </div>
      <p className={`password-strength-label strength-${strengthLevel}`}>
        Strength: {STRENGTH_LABELS[strengthLevel]}
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
