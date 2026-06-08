interface SetupGateProps {
  adminUrl: string
}

/**
 * Shown when the backend reports no admin account exists yet.
 * Blocks all app routes until initial setup is completed via the admin panel.
 */
export function SetupGate({ adminUrl }: SetupGateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold text-ui-primary">First-time setup required</h1>
        <p className="max-w-sm text-sm text-ui-secondary">
          No admin account has been created yet. Complete the setup wizard in the admin panel to
          unlock the platform.
        </p>
      </div>
      <a
        href={adminUrl}
        className="rounded-ui-md bg-brand-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Open Admin Setup
      </a>
      <p className="text-xs text-ui-tertiary">
        After completing setup, refresh this page to continue.
      </p>
    </div>
  )
}
