import { useState } from "react"
import { CommunityButton, FormField, type Navigate } from "./Community"
import { supabase } from "./lib/supabase"
import { backendError } from "./lib/backend"

export default function PasswordReset({
  navigate,
  allowed,
}: {
  navigate: Navigate
  allowed: boolean
}) {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  return (
    <main className="portal-page portal-page--center">
      <section className="auth-card">
        <h1>{saved ? "Password updated" : "Choose a new password"}</h1>
        {saved ? (
          <>
            <p>Your password has been changed. Sign in again to continue.</p>
            <CommunityButton onClick={() => navigate("login")}>
              Go to login
            </CommunityButton>
          </>
        ) : !allowed ? (
          <>
            <p>Open the password recovery link from your email to continue.</p>
            <CommunityButton onClick={() => navigate("forgot")}>
              Request a new link
            </CommunityButton>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (password.length < 8)
                return setError("Use at least eight characters.")
              if (password !== confirmation)
                return setError("Passwords do not match.")
              setBusy(true)
              setError("")
              try {
                const { error } = await supabase.auth.updateUser({ password })
                if (error) throw error
                await supabase.auth.signOut()
                setSaved(true)
              } catch (error) {
                setError(backendError(error))
              } finally {
                setBusy(false)
              }
            }}
          >
            <FormField
              label="New password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="new-password"
              required
            />
            <FormField
              label="Confirm new password"
              value={confirmation}
              onChange={setConfirmation}
              type="password"
              autoComplete="new-password"
              required
            />
            {error && <p role="alert">{error}</p>}
            <CommunityButton type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </CommunityButton>
          </form>
        )}
      </section>
    </main>
  )
}
