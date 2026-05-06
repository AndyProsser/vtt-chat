export type AuthSurfaceRoute = 'login' | 'register' | 'forgot-password' | 'reset-password'

const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/,
}

export function resolveAuthSurfaceRoute(pathname: string): AuthSurfaceRoute {
  if (pathname === '/register') {
    return 'register'
  }
  if (pathname === '/forgot-password') {
    return 'forgot-password'
  }
  if (pathname === '/reset-password') {
    return 'reset-password'
  }
  return 'login'
}

export function navigateAuthSurface(path: string): void {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function isDevPasswordlessLoginEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    ['1', 'true', 'yes', 'on'].includes(
      String(import.meta.env.VITE_ENABLE_PASSWORDLESS_LOGIN || '')
        .trim()
        .toLowerCase()
    )
  )
}

export function normalizeUsernameFromName(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w\s]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'user'
  )
}

export function validateComplexPassword(password: string): string[] {
  const errors: string[] = []

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`At least ${PASSWORD_REQUIREMENTS.minLength} characters`)
  }
  if (!PASSWORD_REQUIREMENTS.hasUppercase.test(password)) {
    errors.push('At least one uppercase letter')
  }
  if (!PASSWORD_REQUIREMENTS.hasLowercase.test(password)) {
    errors.push('At least one lowercase letter')
  }
  if (!PASSWORD_REQUIREMENTS.hasNumber.test(password)) {
    errors.push('At least one number')
  }
  if (!PASSWORD_REQUIREMENTS.hasSpecial.test(password)) {
    errors.push('At least one special character')
  }

  return errors
}
