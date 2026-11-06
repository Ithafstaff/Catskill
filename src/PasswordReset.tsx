import { useState } from "react"
import {
  AuthShell,
  CommunityButton,
  PasswordField,
  type Navigate,
} from "./Community"
import { supabase } from "./lib/supabase"
import { backendError } from "./lib/backend"
import type { CallbackState } from "./lib/authCallback"

export default function PasswordReset({
  navigate,
  allowed,
  callback,
}: {
  navigate: Navigate
  allowed: boolean
  callback: CallbackState
}) {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [updated, setUpdated] = useState(false)
  const [saved, setSaved] = useState(false)
  const finishRecovery = async () => {
    const { error } = await supabase.auth.signOut()
    if (error)
      throw new Error(
        "Your password was updated, but we could not sign out. Please retry below to finish securely.",
      )
    setSaved(true)
  }
  return (
    <AuthShell>
      <section className="auth-card">
        <div className="portal-heading">
          <h1>
            {saved
              ? "Password updated"
              : callback.status === "verifying"
                ? "Verifying your recovery link…"
                : !allowed && !updated
                  ? "Recovery link unavailable"
                  : "Choose a new password"}
          </h1>
        </div>
        {saved ? (
          <>
            <p role="status">
              Your password has been changed. Sign in again to continue.
            </p>
            <CommunityButton onClick={() => navigate("login")}>
              Go to login
            </CommunityButton>
          </>
        ) : callback.status === "verifying" ? (
          <p role="status">Please wait while we verify your link.</p>
        ) : updated ? (
          <>
            {error && (
              <p className="form-alert" role="alert">
                {error}
              </p>
            )}
            <CommunityButton
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError("")
                try {
                  await finishRecovery()
                } catch (error) {
                  setError(backendError(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? "Signing out…" : "Finish signing out"}
            </CommunityButton>
          </>
        ) : !allowed || callback.status === "error" ? (
          <>
            <p className="form-alert" role="alert">
              {callback.error ||
                "Open the password recovery link from your email to continue."}
            </p>
            <CommunityButton onClick={() => navigate("forgot")}>
              Request a new link
            </CommunityButton>
          </>
        ) : (
          <form
            className="auth-card"
            onSubmit={async (event) => {
              event.preventDefault()
              if (busy) return
              if (password.length < 8)
                return setError("Use at least eight characters.")
              if (password !== confirmation)
                return setError("Passwords do not match.")
              setBusy(true)
              setError("")
              try {
                const { error } = await supabase.auth.updateUser({ password })
                if (error) throw error
                setUpdated(true)
                setPassword("")
                setConfirmation("")
                await finishRecovery()
              } catch (error) {
                setError(backendError(error))
              } finally {
                setBusy(false)
              }
            }}
          >
            <PasswordField
              id="reset-password"
              label="New password"
              value={password}
              onChange={setPassword}
              visible={showPassword}
              onToggleVisibility={() => setShowPassword((value) => !value)}
              toggleLabel={
                showPassword ? "Hide new password" : "Show new password"
              }
              hint="At least 8 characters"
            />
            <PasswordField
              id="reset-confirmation"
              label="Confirm new password"
              value={confirmation}
              onChange={setConfirmation}
              visible={showConfirmation}
              onToggleVisibility={() => setShowConfirmation((value) => !value)}
              toggleLabel={
                showConfirmation
                  ? "Hide confirmation password"
                  : "Show confirmation password"
              }
            />
            {error && (
              <p className="form-alert" role="alert">
                {error}
              </p>
            )}
            <CommunityButton type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </CommunityButton>
          </form>
        )}
      </section>
    </AuthShell>
  )
}
