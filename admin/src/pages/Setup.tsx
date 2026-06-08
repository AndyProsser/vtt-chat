import React, { useState } from 'react'
import SetupForm from '../features/setup/SetupForm'
import { API_BASE } from '../utils/api'

interface SetupWizardProps {
  onComplete: (token: string, admin: { id: string; username: string; email: string }) => void
  onError: (error: string) => void
}

interface PasswordValidation {
  isValid: boolean
  score: number
  feedback: string[]
  suggestions: string[]
}

export default function SetupWizard({ onComplete, onError }: SetupWizardProps) {
  const [step, setStep] = useState<'welcome' | 'form' | 'confirm'>('welcome')
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    passwordConfirm: '',
  })
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidation>({
    isValid: false,
    score: 0,
    feedback: [],
    suggestions: [],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validatePasswordStrength = async (password: string) => {
    // Local validation
    const minLength = 12
    const feedback: string[] = []
    let score = 0

    if (password.length >= minLength) score++
    else feedback.push(`Password must be at least ${minLength} characters`)

    if (/[A-Z]/.test(password)) score++
    else feedback.push('Must contain at least one uppercase letter')

    if (/[a-z]/.test(password)) score++
    else feedback.push('Must contain at least one lowercase letter')

    if (/[0-9]/.test(password)) score++
    else feedback.push('Must contain at least one number')

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++
    else feedback.push('Must contain at least one special character')

    const suggestions = [
      'Use a mix of uppercase and lowercase letters',
      'Include numbers and special characters',
      'Consider using a password manager to generate a secure password',
      'Avoid common words or patterns',
    ]

    setPasswordValidation({
      isValid: feedback.length === 0,
      score,
      feedback,
      suggestions,
    })
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value
    setFormData((prev) => ({ ...prev, password }))
    validatePasswordStrength(password)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    if (!formData.username) {
      newErrors.username = 'Username is required'
    } else if (!/^[a-zA-Z0-9_-]{3,}$/.test(formData.username)) {
      newErrors.username = 'Username must be 3+ characters, letters/numbers/underscore/hyphen only'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (!passwordValidation.isValid) {
      newErrors.password = 'Password does not meet security requirements'
    }

    if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = 'Passwords do not match'
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
      const response = await fetch(`${API_BASE}/admin/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          username: formData.username,
          password: formData.password,
          passwordConfirm: formData.passwordConfirm,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setErrors({ form: data.error || 'Setup failed' })
        onError(data.error || 'Setup failed')
        setLoading(false)
        return
      }

      const data = await response.json()
      setStep('confirm')
      setTimeout(() => {
        onComplete(data.token, data.admin)
      }, 2000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Setup failed'
      setErrors({ form: message })
      onError(message)
      setLoading(false)
    }
  }

  if (step === 'welcome') {
    return (
      <div className="setup-wizard">
        <div className="setup-welcome">
          <h1>Welcome to VTT-Chat Admin</h1>
          <p>
            This is your first time setting up the admin console. Let&apos;s create your sysadmin
            account.
          </p>
          <p className="setup-note">
            This account will have full access to the admin panel and system controls. Keep your
            credentials secure.
          </p>
          <button className="admin-btn admin-btn-primary" onClick={() => setStep('form')}>
            Create Admin Account
          </button>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="setup-wizard">
        <div className="setup-confirm">
          <div className="confirm-icon">✓</div>
          <h1>Account Created Successfully</h1>
          <p>Your sysadmin account has been created and you&apos;re now authenticated.</p>
          <p className="confirm-subtitle">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <SetupForm
      loading={loading}
      formData={formData}
      errors={errors}
      passwordValidation={passwordValidation}
      onSubmit={handleSubmit}
      onInputChange={handleInputChange}
      onPasswordChange={handlePasswordChange}
    />
  )
}
