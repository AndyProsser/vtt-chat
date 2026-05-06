/**
 * Password validation and strength checking utilities
 * Supports complex passwords and password managers
 */

export interface PasswordStrengthResult {
  isValid: boolean
  score: number // 0-4
  feedback: string[]
  suggestions: string[]
}

/**
 * Minimum password requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 *
 * These requirements balance usability with baseline account security.
 */
export const MIN_PASSWORD_LENGTH = 8
export const PASSWORD_REQUIREMENTS = {
  minLength: MIN_PASSWORD_LENGTH,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
}

/**
 * Validate password against security requirements
 * Returns detailed feedback to help users create secure passwords
 */
export const validatePassword = (password: string): PasswordStrengthResult => {
  const feedback: string[] = []
  const suggestions: string[] = []
  let score = 0

  if (!password) {
    return {
      isValid: false,
      score: 0,
      feedback: ['Password is required'],
      suggestions: [
        `Use a password with at least ${PASSWORD_REQUIREMENTS.minLength} characters`,
        'Include uppercase and lowercase letters',
        'Include numbers and special characters',
        'Consider using a password manager to generate a strong password',
      ],
    }
  }

  // Check length
  if (password.length >= PASSWORD_REQUIREMENTS.minLength) {
    score++
  } else {
    feedback.push(
      `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters (current: ${password.length})`
    )
    suggestions.push(`Add ${PASSWORD_REQUIREMENTS.minLength - password.length} more characters`)
  }

  // Check uppercase
  if (PASSWORD_REQUIREMENTS.hasUppercase.test(password)) {
    score++
  } else {
    feedback.push('Password must contain at least one uppercase letter (A-Z)')
    suggestions.push('Add an uppercase letter')
  }

  // Check lowercase
  if (PASSWORD_REQUIREMENTS.hasLowercase.test(password)) {
    score++
  } else {
    feedback.push('Password must contain at least one lowercase letter (a-z)')
    suggestions.push('Add a lowercase letter')
  }

  // Check number
  if (PASSWORD_REQUIREMENTS.hasNumber.test(password)) {
    score++
  } else {
    feedback.push('Password must contain at least one number (0-9)')
    suggestions.push('Add a number')
  }

  // Check special character
  if (PASSWORD_REQUIREMENTS.hasSpecial.test(password)) {
    score++
  } else {
    feedback.push('Password must contain at least one special character (!@#$%^&*, etc.)')
    suggestions.push(
      'Add a special character like ! @ # $ % ^ & * ( ) _ + - = [ ] { } ; \' : " \\ | , . < > / ?'
    )
  }

  const isValid = feedback.length === 0

  // Add encouragement if password is valid
  if (isValid) {
    suggestions.push('Excellent! Your password meets all security requirements.')
  }

  return {
    isValid,
    score,
    feedback,
    suggestions,
  }
}

/**
 * Check if password meets minimum requirements
 * Use this for quick validation in API endpoints
 */
export const isPasswordValid = (password: string): boolean => {
  return validatePassword(password).isValid
}

/**
 * Get password strength label for UI display
 */
export const getPasswordStrengthLabel = (score: number): string => {
  switch (score) {
    case 0:
    case 1:
      return 'Weak'
    case 2:
      return 'Fair'
    case 3:
      return 'Good'
    case 4:
      return 'Strong'
    case 5:
      return 'Very Strong'
    default:
      return 'Unknown'
  }
}

/**
 * Get password strength color for UI display
 */
export const getPasswordStrengthColor = (score: number): string => {
  switch (score) {
    case 0:
    case 1:
      return '#dc2626' // red
    case 2:
      return '#f59e0b' // amber
    case 3:
      return '#eab308' // yellow
    case 4:
      return '#84cc16' // lime
    case 5:
      return '#22c55e' // green
    default:
      return '#6b7280' // gray
  }
}
