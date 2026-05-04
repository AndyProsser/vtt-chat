import { useState } from 'react'

interface GuestUpgradePromptProps {
  email: string
  loading: boolean
  onUpgrade: (password: string) => Promise<void>
  onDismiss: () => void
}

export function GuestUpgradePrompt({
  email,
  loading,
  onUpgrade,
  onDismiss,
}: GuestUpgradePromptProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submitUpgrade = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!password.trim()) {
      setError('Password is required')
      return
    }

    try {
      await onUpgrade(password)
      setPassword('')
    } catch (upgradeError) {
      const message = upgradeError instanceof Error ? upgradeError.message : 'Upgrade failed'
      setError(message)
    }
  }

  return (
    <section className="mx-auto mt-4 w-full max-w-6xl rounded-ui-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-base font-semibold">Guest Account</h2>
          <p className="mt-1 text-sm">
            Upgrade to a full account to unlock admin access and persistent account controls.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-ui-sm border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-medium hover:bg-amber-200"
        >
          Dismiss
        </button>
      </div>

      <form
        onSubmit={submitUpgrade}
        className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Email</span>
          <input
            type="email"
            value={email}
            readOnly
            className="block w-full rounded-ui-sm border border-amber-300 bg-amber-100 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">New Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="block w-full rounded-ui-sm border border-amber-300 bg-white px-3 py-2 text-sm"
            disabled={loading}
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="rounded-ui-sm bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-400"
        >
          {loading ? 'Upgrading...' : 'Upgrade'}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-ui-error-text">{error}</p>}
    </section>
  )
}
