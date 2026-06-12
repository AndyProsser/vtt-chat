import { useEffect } from 'react'

interface SetupGateProps {
  adminUrl: string
}

/**
 * Redirects immediately to the admin setup wizard when no admin account exists.
 * Shows a brief styled screen while the redirect navigates.
 */
export function SetupGate({ adminUrl }: SetupGateProps) {
  useEffect(() => {
    const url = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`
    window.location.replace(url)
  }, [adminUrl])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 animate-spin rounded-full border-2 border-ui-border border-t-brand-primary" />
        <h1 className="text-lg font-semibold text-ui-primary">Opening setup wizard…</h1>
        <p className="max-w-xs text-sm text-ui-secondary">
          Redirecting you to the admin panel to complete first-time setup.
        </p>
      </div>
      <a
        href={adminUrl}
        className="mt-2 text-xs text-ui-tertiary underline underline-offset-2 hover:text-ui-secondary"
      >
        Click here if you are not redirected
      </a>
    </div>
  )
}
