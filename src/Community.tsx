import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import MinyanScheduleEditor, {
  createMinyanSchedule,
  formatMinyanSchedule,
  validateMinyanSchedule,
  type MinyanSchedule,
} from "./MinyanSchedule"
import { createLocalId } from "./ids"
import { supabase } from "./lib/supabase"
import {
  backendError,
  signIn,
  rpc,
  resendVerificationEmail,
  requestPasswordResetEmail,
} from "./lib/backend"
import { confirmationRedirect, type CallbackState } from "./lib/authCallback"

import DirectoryExplorer from "./DirectoryExplorer"
import { listingPlaces } from "./lib/mapPlaces"
import AddressAutocomplete from "./AddressAutocomplete"
import { parseCoordinates } from "./lib/coordinates"
const LocationMap = lazy(() => import("./LocationMap"))

export type CommunityPage = "reset-password" | "login" | "signup" | "forgot" | "verify" | "onboarding" | "dashboard" | "account" | "add-listing" | "mikvah-form" | "shul-form" | "manage-shul" | "confirmation" | "admin" | "admin-review" | "mikvah-home" | "mikvah-directory" | "mikvah-detail"

export type User = {
  id: string
  name: string
  email: string
  phone: string
  role: "contributor" | "admin"
}

export type AdditionalLocation = {
  id: string
  name: string
  type: string
  address: string
  schedules?: MinyanSchedule[]
}

export type ListingStatus = "Draft" | "Pending Review" | "Published" | "Changes Requested" | "Rejected" | "Archived"

export type Listing = {
  reviewStatus?: string
  contributorEmail?: string
  contributorPhone?: string
  versionId?: string
  versionNumber?: number
  visibility?: "unpublished" | "published" | "archived"
  publishedVersion?: Listing | null
  id: string
  ownerId: string
  ownerName: string
  type: "Mikvah" | "Shul"
  name: string
  address: string
  city: string
  state: string
  zip: string
  mapLocation: string
  status: ListingStatus
  createdAt: string
  updatedAt: string
  submittedAt?: string
  reviewNotes?: string
  data: Record<string, string>
  primarySchedules?: MinyanSchedule[]
  locations?: AdditionalLocation[]
}

export type Navigate = (
  page: CommunityPage | "home" | "find" | "shul" | "shuls" | "shabbos",
  intent?: string,
) => void

const today = () => new Date().toISOString()
const displayDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "Not yet submitted"

interface IconProps {
  name: string
  size?: number
}

export const Icon = ({ name, size = 18 }: IconProps) => {
  const paths: Record<string, React.ReactNode> = {
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    "eye-off": (
      <>
        <path d="m3 3 18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.1 3.8" />
        <path d="M6.6 6.6C3.7 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.9" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    building: (
      <>
        <path d="M4 21V8l8-5 8 5v13M8 21v-7h8v7M9 9h.01M15 9h.01" />
      </>
    ),
    water: (
      <>
        <path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11Z" />
        <path d="M9 15c.5 1.3 1.5 2 3 2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" />
      </>
    ),
    grip: (
      <>
        <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </>
    ),
  }
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export const CommunityButton = ({
  children,
  variant = "primary",
  onClick,
  type = "button",
  disabled = false,
  className = "",
  id,
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger"
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  type?: "button" | "submit"
  disabled?: boolean
  className?: string
  id?: string
}) => (
  <button
    type={type}
    className={`button button--${variant} ${className}`}
    onClick={onClick}
    disabled={disabled}
    id={id}
  >
    {children}
  </button>
)

const PageHeading = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description: string
}) => (
  <div className="portal-heading">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h1>{title}</h1>
    <p>{description}</p>
  </div>
)

export const FormField = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  hint,
  error,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  hint?: string
  error?: string
  autoComplete?: string
}) => (
  <label className={`form-field ${error ? "has-error" : ""}`}>
    <span>
      {label}
      {required && <b aria-hidden="true"> *</b>}
    </span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      aria-invalid={Boolean(error)}
    />
    {error ? (
      <small className="field-error" role="alert">{error}</small>
    ) : (
      hint && <small>{hint}</small>
    )}
  </label>
)

export const PasswordField = ({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisibility,
  toggleLabel,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggleVisibility: () => void
  toggleLabel: string
  hint?: string
}) => (
  <div className="form-field password-field">
    <span>
      <label htmlFor={id}>{label}<b aria-hidden="true"> *</b></label>
    </span>
    <div className="password-field__control">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
        required
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={onToggleVisibility}
        aria-label={toggleLabel}
        aria-pressed={visible}
        aria-controls={id}
      >
        <Icon name={visible ? "eye-off" : "eye"} />
      </button>
    </div>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>
)

const TextAreaField = ({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
}) => (
  <label className="form-field">
    <span>{label}</span>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={5}
    />
    {hint && <small>{hint}</small>}
  </label>
)

const Select = ({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) => (
  <label className="form-field">
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  </label>
)

const Checkbox = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}) => (
  <label className="check-control">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>
      <i>
        <Icon name="check" size={13} />
      </i>
      {children}
    </span>
  </label>
)

export const StatusBadge = ({ status }: { status: ListingStatus }) => (
  <span
    className={`listing-status listing-status--${status.toLowerCase().replace(/ /g, "-")}`}
  >
    <i />
    {status}
  </span>
)

export function AuthShell({
  children,
  asideTitle = "Keep community information current.",
  asideText = "Contributors help neighbors find trusted, accurate details about local Mikvahs, Shuls, and Minyanim.",
  tone = "default",
}: {
  children: React.ReactNode
  asideTitle?: string
  asideText?: string
  tone?: "default" | "mikvah"
}) {
  return (
    <main
      className={`auth-page${tone === "mikvah" ? " auth-page--mikvah" : ""}`}
    >
      <section className="auth-aside">
        <div>
          <span className="auth-seal">CE</span>
          <p className="eyebrow eyebrow--gold">COMMUNITY CONTRIBUTOR</p>
          <h2>{asideTitle}</h2>
          <p>{asideText}</p>
          <ul>
            <li>
              <Icon name="check" />
              Save work as a draft
            </li>
            <li>
              <Icon name="check" />
              Manage multiple listings
            </li>
            <li>
              <Icon name="check" />
              Every submission is reviewed
            </li>
          </ul>
        </div>
      </section>
      <section className="auth-main">{children}</section>
    </main>
  )
}

export function LoginPage({
  navigate,
  onLogin,
  intent,
}: {
  navigate: Navigate
  onLogin: (user: User) => void
  intent?: string
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState("")
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError("Please enter a valid email address.")
    if (!password) return setError("Please enter your password.")
    setLoading(true)
    setError("")
    setUnconfirmedEmail("")
    try {
      const signedIn = await signIn(email.trim(), password)
      onLogin(signedIn)
      navigate(signedIn.role === "admin" ? "admin" : intent === "mikvah" ? "mikvah-form" : intent === "shul" ? "shul-form" : "dashboard")
    } catch (error) {
      if ((error as { code?: string })?.code === "email_not_confirmed") setUnconfirmedEmail(email.trim())
      setError(backendError(error))
    } finally { setLoading(false) }
  }
  return (
    <AuthShell tone={intent === "mikvah" ? "mikvah" : "default"}>
      <form className="auth-card" onSubmit={submit} noValidate>
        <PageHeading
          title="Welcome Back"
          description="Log in to manage your Mikvah and Shul listings and keep community information up to date."
        />
        <FormField
          label="Email Address"
          value={email}
          onChange={(value) => {
            setEmail(value)
            setError("")
            setUnconfirmedEmail("")
          }}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          error={error}
          required
        />
        {unconfirmedEmail && (
          <EmailResendAction
            email={unconfirmedEmail}
            intent={intent}
            label="Resend confirmation email"
          />
        )}
        <div className="password-wrap">
          <FormField
            label="Password"
            value={password}
            onChange={(value) => {
              setPassword(value)
              setError("")
            }}
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            <Icon name="eye" />
          </button>
        </div>
        <div className="auth-options">
          <span>Your session stays signed in on this browser.</span>
          <button
            type="button"
            className="inline-link"
            onClick={() => navigate("forgot", intent)}
          >
            Forgot Password?
          </button>
        </div>
        <CommunityButton
          type="submit"
          disabled={loading}
          className="button--full"
        >
          {loading ? "Logging In…" : "Log In"}
        </CommunityButton>
        <p className="auth-switch">
          New to Catskills Eruv?{" "}
          <button type="button" onClick={() => navigate("signup", intent)}>
            Create an account
          </button>
        </p>
      </form>
    </AuthShell>
  )
}

export function SignupPage({
  navigate,
  intent,
  onVerificationEmail,
}: {
  navigate: Navigate
  intent?: string
  onVerificationEmail: (email: string) => void
}) {
  const [data, setData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  })
  const [loading, setLoading] = useState(false)
  const [terms, setTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const update = (key: keyof typeof data, value: string) =>
    setData({ ...data, [key]: value })
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!data.name.trim()) return setError("Please enter your full name.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      return setError("Please enter a valid email address.")
    if (data.password.length < 8)
      return setError("Password must contain at least 8 characters.")
    if (data.password !== data.confirm)
      return setError("Passwords do not match.")
    if (!terms)
      return setError("Please accept the Terms of Service and Privacy Policy.")
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email.trim(), password: data.password,
        options: { data: { name: data.name.trim(), phone: data.phone.trim() }, emailRedirectTo: confirmationRedirect(window.location.origin, intent) },
      })
      if (error) throw error
      onVerificationEmail(data.email.trim())
      navigate("verify", intent)
    } catch (error) { setError(backendError(error)) } finally { setLoading(false) }
  }
  return (
    <AuthShell
      tone={intent === "mikvah" ? "mikvah" : "default"}
      asideTitle="Join those who care for the kehillah."
      asideText="Share details only when you are authorized to represent a congregation or community facility."
    >
      <form className="auth-card auth-card--wide" onSubmit={submit} noValidate>
        <PageHeading
          title="Join Our Community"
          description="Create an account to add and manage Mikvah and Shul information for your community."
        />
        {error && (
          <div className="form-alert" role="alert">
            <Icon name="alert" />
            {error}
          </div>
        )}
        <div className="form-grid form-grid--2 signup-fields">
          <FormField
            label="Full Name"
            value={data.name}
            onChange={(value) => update("name", value)}
            placeholder="Your full name"
            required
          />
          <FormField
            label="Phone Number (optional)"
            value={data.phone}
            onChange={(value) => update("phone", value)}
            placeholder="(845) 555-0123"
            type="tel"
          />
          <div className="signup-fields__full">
            <FormField
              label="Email Address"
              value={data.email}
              onChange={(value) => update("email", value)}
              placeholder="you@example.com"
              type="email"
              required
            />
          </div>
          <PasswordField
            id="signup-password"
            label="Password"
            value={data.password}
            onChange={(value) => update("password", value)}
            visible={showPassword}
            onToggleVisibility={() => setShowPassword((visible) => !visible)}
            toggleLabel={showPassword ? "Hide password" : "Show password"}
            hint="At least 8 characters"
          />
          <PasswordField
            id="signup-confirm-password"
            label="Confirm Password"
            value={data.confirm}
            onChange={(value) => update("confirm", value)}
            visible={showConfirmPassword}
            onToggleVisibility={() =>
              setShowConfirmPassword((visible) => !visible)
            }
            toggleLabel={
              showConfirmPassword
                ? "Hide confirmation password"
                : "Show confirmation password"
            }
          />
        </div>
        <Checkbox checked={terms} onChange={setTerms}>
          I agree to the{" "}
          <button
            type="button"
            className="inline-link"
            onClick={() =>
              window.alert(
                "Terms of Service are shown here in the production experience.",
              )
            }
          >
            Terms of Service
          </button>{" "}
          and{" "}
          <button
            type="button"
            className="inline-link"
            onClick={() =>
              window.alert(
                "The Privacy Policy is shown here in the production experience.",
              )
            }
          >
            Privacy Policy
          </button>
          .
        </Checkbox>
        <CommunityButton type="submit" disabled={loading} className="button--full">
          {loading ? "Creating account…" : "Create Account"}
        </CommunityButton>
        <p className="auth-switch">
          Already have an account?{" "}
          <button type="button" onClick={() => navigate("login", intent)}>
            Log In
          </button>
        </p>
      </form>
    </AuthShell>
  )
}

/** A wall-clock deadline keeps the cooldown accurate after background tabs resume. */
function EmailResendAction({
  email,
  intent,
  recovery = false,
  initialCooldown = false,
  label,
}: {
  email: string
  intent?: string
  recovery?: boolean
  initialCooldown?: boolean
  label: string
}) {
  const [deadline, setDeadline] = useState(() =>
    initialCooldown ? Date.now() + 60000 : 0,
  )
  const [remaining, setRemaining] = useState(initialCooldown ? 60 : 0)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    if (!deadline) return
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(seconds)
      if (seconds === 0) setDeadline(0)
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [deadline])
  return (
    <div className="auth-email-action">
      <CommunityButton
        variant="secondary"
        className="button--full"
        disabled={busy || remaining > 0 || !email.trim()}
        onClick={async () => {
          if (sending.current || Date.now() < deadline) return
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setError("Please enter a valid email address.")
            return
          }
          sending.current = true
          setBusy(true)
          setError("")
          setMessage("")
          setDeadline(Date.now() + 60000)
          setRemaining(60)
          try {
            if (recovery) await requestPasswordResetEmail(email)
            else await resendVerificationEmail(email, intent)
            setMessage(
              recovery
                ? "If an account exists for this email, you will receive a password recovery email. Check your inbox and spam folder."
                : "If this address needs confirmation, you will receive a verification email. Check your inbox and spam folder.",
            )
          } catch (error) {
            setError(backendError(error))
          } finally {
            sending.current = false
            setBusy(false)
          }
        }}
      >
        {busy ? "Sending…" : remaining > 0 ? `${label} (${remaining}s)` : label}
      </CommunityButton>
      <p role="status">{message}</p>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function ForgotPage({
  navigate,
  intent,
}: {
  navigate: Navigate
  intent?: string
}) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  return (
    <AuthShell tone={intent === "mikvah" ? "mikvah" : "default"}>
      {sent ? (
        <div className="auth-card">
          <PageHeading
            title="Check Your Email"
            description={`If an account exists for ${email.trim()}, you will receive a password recovery email. Check your inbox and spam folder.`}
          />
          <EmailResendAction
            email={email}
            recovery
            initialCooldown
            label="Resend reset email"
          />
          <CommunityButton
            onClick={() => navigate("login", intent)}
            className="button--full"
          >
            Return to Login
          </CommunityButton>
          <button
            className="back-auth"
            onClick={() => {
              setSent(false)
              setError("")
            }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form
          className="auth-card"
          onSubmit={async (event) => {
            event.preventDefault()
            if (loading) return
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
              return setError("Please enter a valid email address.")
            setLoading(true)
            setError("")
            try {
              await requestPasswordResetEmail(email)
              setSent(true)
            } catch (error) {
              setError(backendError(error))
            } finally {
              setLoading(false)
            }
          }}
        >
          <PageHeading
            title="Reset Your Password"
            description="Enter your account email and we'll help you return to your listings."
          />
          <FormField
            label="Email Address"
            value={email}
            onChange={(value) => {
              setEmail(value)
              setError("")
            }}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            required
          />
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          <CommunityButton
            type="submit"
            disabled={loading}
            className="button--full"
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </CommunityButton>
          <button
            type="button"
            className="back-auth"
            onClick={() => navigate("login", intent)}
          >
            Return to Login
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export function VerifyPage({
  navigate,
  intent,
  email: submittedEmail = "",
  callback = { status: "idle" },
  user,
  profileLoading = false,
  emailChange = false,
}: {
  navigate: Navigate
  intent?: string
  email?: string
  callback?: CallbackState
  user?: User | null
  profileLoading?: boolean
  emailChange?: boolean
}) {
  const [email, setEmail] = useState(submittedEmail)
  const verified = callback.status === "verified"
  return (
    <AuthShell tone={intent === "mikvah" ? "mikvah" : "default"}>
      <div className="auth-card">
        <PageHeading
          title={
            callback.status === "verifying"
              ? "Verifying your email…"
              : verified
                ? emailChange
                  ? "Email confirmation accepted"
                  : "Your email is verified"
                : callback.status === "error"
                  ? "Request a new verification link"
                  : "Check your email"
          }
          description={
            verified
              ? emailChange
                ? "If confirmation is required at both addresses, open both emails to complete your email change."
                : "Your email address is confirmed. Continue to your listings or sign in to your account."
              : "Open the latest confirmation link in your email. Check your inbox and spam folder."
          }
        />
        {callback.status === "verifying" ? (
          <p role="status">Verifying your confirmation link…</p>
        ) : verified ? (
          <>
            <p role="status">
              {profileLoading
                ? "Loading your account…"
                : "Confirmation complete."}
            </p>
            <CommunityButton
              disabled={profileLoading}
              onClick={() =>
                navigate(
                  user
                    ? user.role === "admin"
                      ? "admin"
                      : intent === "mikvah"
                        ? "mikvah-form"
                        : intent === "shul"
                          ? "shul-form"
                          : "dashboard"
                    : "login",
                  intent,
                )
              }
            >
              {user
                ? intent
                  ? "Continue to your form"
                  : "Continue to your dashboard"
                : "Go to login"}
            </CommunityButton>
          </>
        ) : (
          <>
            {callback.error && (
              <p className="form-alert" role="alert">
                {callback.error}
              </p>
            )}
            <FormField
              label="Email Address"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              hint="Enter or edit the address that needs verification."
            />
            <EmailResendAction
              email={email}
              intent={intent}
              initialCooldown={!!submittedEmail && callback.status === "idle"}
              label="Resend verification email"
            />
            <CommunityButton onClick={() => navigate("login", intent)}>
              Go to login <Icon name="arrow" />
            </CommunityButton>
          </>
        )}
      </div>
    </AuthShell>
  )
}

export function OnboardingPage({ navigate }: { navigate: Navigate }) {
  return (
    <main className="portal-page">
      <div className="portal-container">
        <PageHeading
          eyebrow="WELCOME TO THE CONTRIBUTOR PORTAL"
          title="What Would You Like to Add?"
          description="Help keep our community directory accurate by adding a Mikvah or Shul."
        />
        <div className="choice-grid">
          <article>
            <span className="choice-icon">
              <Icon name="water" size={30} />
            </span>
            <h2>Add a Mikvah</h2>
            <p>
              Share Mikvah location, contact information, appointment
              requirements, seasonal hours, and important visitor instructions.
            </p>
            <CommunityButton onClick={() => navigate("mikvah-form")}>
              Register a Mikvah <Icon name="arrow" />
            </CommunityButton>
          </article>
          <article>
            <span className="choice-icon">
              <Icon name="building" size={30} />
            </span>
            <h2>Add a Shul</h2>
            <p>
              Share Shul details, Gabbai contact information, Minyan locations,
              and special directions.
            </p>
            <CommunityButton onClick={() => navigate("shul-form")}>
              Register a Shul <Icon name="arrow" />
            </CommunityButton>
          </article>
        </div>
        <button className="skip-link" onClick={() => navigate("dashboard")}>
          Skip for now and go to dashboard
        </button>
      </div>
    </main>
  )
}

export function DashboardPage({
  user,
  listings,
  navigate,
  onDelete,
}: {
  user: User
  listings: Listing[]
  navigate: Navigate
  onDelete: (id: string) => Promise<void>
}) {
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const owned = listings.filter((listing) => listing.ownerId === user.id)
  const counts = (status?: ListingStatus) =>
    status
      ? owned.filter((item) => item.status === status).length
      : owned.length
  return (
    <PortalLayout active="dashboard" navigate={navigate}>
      <PageHeading
        eyebrow={`WELCOME BACK, ${user.name.split(" ")[0].toUpperCase()}`}
        title="My Dashboard"
        description="Manage your Mikvah and Shul listings and help keep community information accurate."
      />
      {error && <p className="form-alert" role="alert">{error}</p>}
      <div className="dashboard-actions">
        <CommunityButton onClick={() => navigate("mikvah-form")}>
          <Icon name="plus" /> Add Mikvah
        </CommunityButton>
        <CommunityButton
          variant="secondary"
          onClick={() => navigate("shul-form")}
        >
          <Icon name="plus" /> Add Shul
        </CommunityButton>
      </div>
      <div className="metric-grid">
        <Metric label="Total Listings" value={counts()} />
        <Metric label="Published" value={counts("Published")} />
        <Metric label="Pending Review" value={counts("Pending Review")} />
        <Metric label="Drafts" value={counts("Draft")} />
      </div>
      <section className="listings-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">YOUR CONTRIBUTIONS</p>
            <h2>My Listings</h2>
          </div>
          <button onClick={() => navigate("add-listing")}>
            Add Listing <Icon name="plus" />
          </button>
        </div>
        {owned.length === 0 ? (
          <EmptyListings navigate={navigate} />
        ) : (
          <div className="listing-table">
            <div className="listing-table__head">
              <span>Listing</span>
              <span>Type</span>
              <span>Location</span>
              <span>Status</span>
              <span>Last Updated</span>
              <span>Actions</span>
            </div>
            {owned.map((item) => (
              <div className="listing-table__row" key={item.id}>
                <span>
                  {item.type === "Shul" ? (
                    <a
                      className="listing-name-link"
                      href={`/contributor/shuls/${encodeURIComponent(item.id)}`}
                      onClick={(event) => {
                        event.preventDefault()
                        navigate("manage-shul", item.id)
                      }}
                    >
                      <strong>{item.name || `Untitled ${item.type}`}</strong>
                    </a>
                  ) : (
                    <strong>{item.name || `Untitled ${item.type}`}</strong>
                  )}
                  <small>ID {item.id.slice(-6)}</small>
                  {item.reviewNotes && <small>Reviewer feedback: {item.reviewNotes}</small>}
                  {item.visibility === "published" && item.status !== "Published" && <small>Your approved version remains public.</small>}
                </span>
                <span>{item.type}</span>
                <span>
                  {[item.city, item.state].filter(Boolean).join(", ") ||
                    "Not provided"}
                </span>
                <StatusBadge status={item.status} />
                <span>{displayDate(item.updatedAt)}</span>
                <span className="row-actions">
                  <button
                    disabled={item.status === "Pending Review" || item.status === "Archived"}
                    onClick={() =>
                      item.type === "Mikvah"
                        ? navigate("mikvah-form", item.id)
                        : navigate("manage-shul", item.id)
                    }
                  >
                    {item.type === "Mikvah" ? "Edit" : "Manage"}
                  </button>
                  {item.status === "Draft" && (
                    <button
                      className="danger-link"
                      disabled={deleting}
                      onClick={async () => {
                        if (!window.confirm("Delete this draft? This cannot be undone.")) return
                        setDeleting(true); setError("")
                        try { await onDelete(item.id) } catch (error) { setError(backendError(error)) } finally { setDeleting(false) }
                      }}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </PortalLayout>
  )
}

interface MetricProps {
  label: string
  value: number
}

const Metric = ({ label, value }: MetricProps) => (
  <article className="metric">
    <span>{label}</span>
    <strong>{String(value).padStart(2, "0")}</strong>
    <i />
  </article>
)

const EmptyListings = ({ navigate }: { navigate: Navigate }) => (
  <div className="empty-state">
    <span>
      <Icon name="building" size={30} />
    </span>
    <h3>You Haven't Added Any Listings Yet</h3>
    <p>
      Help your community by sharing accurate information about a Mikvah or
      Shul.
    </p>
    <div>
      <CommunityButton onClick={() => navigate("mikvah-form")}>
        Add a Mikvah
      </CommunityButton>
      <CommunityButton
        variant="secondary"
        onClick={() => navigate("shul-form")}
      >
        Add a Shul
      </CommunityButton>
    </div>
  </div>
)

export function PortalLayout({
  children,
  navigate,
  active,
}: {
  children: React.ReactNode
  navigate: Navigate
  active: string
}) {
  return (
    <main className="portal-page">
      <div className="portal-shell">
        <aside className="portal-sidebar">
          <p>CONTRIBUTOR PORTAL</p>
          <button
            className={active === "dashboard" ? "is-active" : ""}
            onClick={() => navigate("dashboard")}
          >
            <Icon name="building" /> My Dashboard
          </button>
          <button
            className={active === "listings" ? "is-active" : ""}
            onClick={() => navigate("dashboard")}
          >
            <Icon name="map" /> My Listings
          </button>
          <button
            className={active === "account" ? "is-active" : ""}
            onClick={() => navigate("account")}
          >
            <Icon name="user" /> Account Settings
          </button>
          <hr />
          <button onClick={() => navigate("add-listing")}>
            <Icon name="plus" /> Add Listing
          </button>
        </aside>
        <div className="portal-content">{children}</div>
      </div>
    </main>
  )
}

export function AccountPage({
  user,
  navigate,
  onUpdate,
  onLogout,
}: {
  user: User
  navigate: Navigate
  onUpdate: (user: User) => Promise<void>
  onLogout: () => void
}) {
  const [draft, setDraft] = useState(user)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <PortalLayout navigate={navigate} active="account">
      <PageHeading
        eyebrow="PROFILE & SECURITY"
        title="Account Settings"
        description="Manage your personal information and account preferences."
      />
      <div className="settings-grid">
        <section className="settings-card">
          <h2>Personal Information</h2>
          <p>This information identifies you to directory reviewers.</p>
          <FormField
            label="Full Name"
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
          />
          <p><strong>Verified email:</strong> {user.email}</p>
          <FormField
            label="Phone Number"
            value={draft.phone}
            onChange={(phone) => setDraft({ ...draft, phone })}
            type="tel"
          />
          {error && <p role="alert">{error}</p>}
          {saved && (
            <div className="save-note">
              <Icon name="check" /> Account details saved.
            </div>
          )}
          <CommunityButton
            disabled={busy}
            onClick={async () => {
              setBusy(true); setSaved(false); setError("")
              try { await onUpdate(draft); setSaved(true) }
              catch (error) { setError(backendError(error)) } finally { setBusy(false) }
            }}
          >
            Save Changes
          </CommunityButton>
        </section>
        <section className="settings-card">
          <h2>Account Security</h2>
          <p>
            Use the recovery email to securely choose a new password.
          </p>
          <CommunityButton
            variant="secondary"
            onClick={() => navigate("forgot")}
          >
            Change Password
          </CommunityButton>
          <button className="settings-logout" onClick={onLogout}>
            Log Out
          </button>
          <hr />
          <h3>Account Management</h3>
          <p>
            Requesting deletion would remove your profile. Published community
            records would be transferred for administrative review rather than
            silently removed.
          </p>
          <button
            className="danger-link"
            disabled={busy}
            onClick={async () => {
              setBusy(true); setError("")
              try { await rpc("request_account_deletion"); setError("Your deletion request was sent for administrative review.") }
              catch (error) { setError(backendError(error)) } finally { setBusy(false) }
            }}
          >
            Request Account Deletion
          </button>
        </section>
      </div>
    </PortalLayout>
  )
}

const mikvahSteps = [
  "Basic Information",
  "Contact & Rabbinical",
  "Appointments & Availability",
  "Operating Hours",
  "Additional Information",
  "Review & Submit",
]
const shulSteps = [
  "Shul Information",
  "Gabbai Information",
  "Additional Minyan Locations",
  "Special Directions",
  "Review & Submit",
]

const emptyMikvah: Record<string, string> = {
  name: "",
  address: "",
  city: "",
  state: "NY",
  zip: "",
  mapLocation: "",
  contactPerson: "",
  contactPhone: "",
  rav: "",
  ravPhone: "",
  permission: "",
  appointmentRequired: "No",
  appointmentPhone: "",
  season: "Year-Round",
  summerFrom: "",
  summerTo: "",
  summerNote: "",
  winterFrom: "",
  winterTo: "",
  winterNote: "",
  fridayHours: "",
  motzeiHours: "",
  additionalInfo: "",
  confirmed: "",
}

const emptyShul: Record<string, string> = {
  name: "",
  address: "",
  city: "",
  state: "NY",
  zip: "",
  mapLocation: "",
  gabbaiName: "",
  gabbaiPhone: "",
  specialDirections: "",
  confirmed: "",
}

function Progress({
  steps,
  current,
  goTo,
}: {
  steps: string[]
  current: number
  goTo: (step: number) => void
}) {
  return (
    <div className="form-progress">
      <div className="progress-copy">
        <span>
          Step {current + 1} of {steps.length}
        </span>
        <strong>{steps[current]}</strong>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step}
            className={
              index === current
                ? "is-current"
                : index < current
                  ? "is-complete"
                  : ""
            }
          >
            <button onClick={() => index <= current && goTo(index)}>
              <i>
                {index < current ? <Icon name="check" size={12} /> : index + 1}
              </i>
              <span>{step}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function FormShell({
  busy = false,
  tone = "default",
  title,
  subtitle,
  steps,
  step,
  setStep,
  children,
  onDraft,
  onContinue,
  final = false,
}: {
  busy?: boolean
  tone?: "default" | "mikvah"
  title: string
  subtitle: string
  steps: string[]
  step: number
  setStep: (step: number) => void
  children: React.ReactNode
  onDraft: () => void
  onContinue: () => void
  final?: boolean
}) {
  return (
    <main
      className={`form-page${tone === "mikvah" ? " form-page--mikvah" : ""}`}
    >
      <div className="form-page__head">
        <div className="form-container">
          <p className="eyebrow">COMMUNITY DIRECTORY SUBMISSION</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="form-container form-layout">
        <Progress steps={steps} current={step} goTo={target => { if (!busy) setStep(target) }} />
        <section className="form-card" aria-busy={busy}><fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {children}
          <div className="form-actions">
            <div>
              {step > 0 && (
                <CommunityButton
                  variant="ghost"
                  onClick={() => setStep(step - 1)}
                >
                  ← Back
                </CommunityButton>
              )}
              <CommunityButton variant="secondary" onClick={onDraft}>
                Save as Draft
              </CommunityButton>
            </div>
            <CommunityButton onClick={onContinue}>
              {final
                ? "Submit for Review"
                : step === steps.length - 2
                  ? "Review Submission"
                  : "Continue"}{" "}
              <Icon name="arrow" />
            </CommunityButton>
          </div>
        </fieldset></section>
      </div>
    </main>
  )
}

function AddressFields({
  data,
  update,
}: {
  data: Record<string, string>
  update: (key: string, value: string) => void
}) {
  return (
    <>
      <AddressAutocomplete
        value={data.address}
        onChange={(value) => { update("address", value); update("mapLocation", "") }}
        onSelect={item => {
          update("address", item.address_line1 || item.formatted)
          update("city", item.city || item.town || item.village || "")
          update("state", item.state_code || item.state || "")
          update("zip", item.postcode || "")
          update("mapLocation", `${item.lat.toFixed(6)}, ${item.lon.toFixed(6)}`)
        }}
      />
      <div className="form-grid form-grid--address">
        <FormField
          label="City"
          value={data.city}
          onChange={(value) => update("city", value)}
          required
        />
        <FormField
          label="State"
          value={data.state}
          onChange={(value) => update("state", value)}
          required
        />
        <FormField
          label="ZIP Code"
          value={data.zip}
          onChange={(value) => update("zip", value)}
          required
        />
      </div>
      <LocationField
        value={data.mapLocation}
        onChange={(value) => update("mapLocation", value)}
      />
    </>
  )
}

function LocationField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const valid =
    !value ||
    parseCoordinates(value) !== null ||
    /^https:\/\/(?:www\.)?(?:google\.[^/]+\/maps|maps\.app\.goo\.gl\/)/.test(value)
  return (
    <div className="location-field">
      <FormField
        label="GPS / Google Maps Location"
        value={value}
        onChange={onChange}
        placeholder="Paste a Google Maps URL or latitude, longitude"
        hint="In Google Maps, choose Share, then Copy link. Coordinates are also accepted."
        error={
          valid
            ? undefined
            : "Please enter a valid Google Maps URL or GPS coordinates."
        }
      />
      <Suspense fallback={<p>Loading map…</p>}>
        <LocationMap value={value} onChange={onChange} />
      </Suspense>
    </div>
  )
}

function SectionIntro({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="form-section-intro">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  )
}

export function MikvahForm({
  user,
  existing,
  onSave,
  navigate,
}: {
  user: User
  existing?: Listing
  onSave: (listing: Listing) => Promise<Listing>
  navigate: Navigate
}) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<Record<string, string>>({
    ...emptyMikvah,
    ...(existing?.data || {}),
    name: existing?.name || "",
    address: existing?.address || "",
    city: existing?.city || "",
    state: existing?.state || "NY",
    zip: existing?.zip || "",
    mapLocation: existing?.mapLocation || "",
  })
  const [error, setError] = useState("")
  const update = (key: string, value: string) => {
    setData(previous => ({ ...previous, [key]: value }))
    setError("")
  }
  const listing = (status: ListingStatus): Listing => ({
    versionId: existing?.versionId,
    versionNumber: existing?.versionNumber,
    id: existing?.id || `mik-${Date.now()}`,
    ownerId: user.id,
    ownerName: user.name,
    type: "Mikvah",
    name: data.name,
    address: data.address,
    city: data.city,
    state: data.state,
    zip: data.zip,
    mapLocation: data.mapLocation,
    status,
    createdAt: existing?.createdAt || today(),
    updatedAt: existing?.updatedAt || today(),
    submittedAt: status === "Pending Review" ? today() : existing?.submittedAt,
    data,
  })
  const validate = () => {
    if (
      step === 0 &&
      (!data.name || !data.address || !data.city || !data.state || !data.zip)
    )
      return "Please complete all required basic information."
    if (step === 1 && !data.permission)
      return "Please confirm you have permission to publish the contact details."
    if (
      step === 2 &&
      data.appointmentRequired === "Yes" &&
      !data.appointmentPhone
    )
      return "Appointment telephone is required when appointments are mandatory."
    if (step === 5 && !data.confirmed)
      return "Please confirm that the information is accurate and authorized."
    return ""
  }
  const next = async () => {
    if (saving) return
    const message = validate()
    if (message) return setError(message)
    if (step < 5) setStep(step + 1)
    else {
      const item = listing("Pending Review")
      setSaving(true)
      try { const saved = await onSave(item); navigate("confirmation", saved.id) }
      catch (error) { setError(backendError(error)) } finally { setSaving(false) }
    }
  }
  const saveDraft = async () => {
    if (saving) return
    setSaving(true)
    try { await onSave(listing("Draft")); navigate("dashboard") }
    catch (error) { setError(backendError(error)) } finally { setSaving(false) }
  }
  return (
    <FormShell
      busy={saving}
      tone="mikvah"
      title={existing ? "Edit Mikvah" : "Register a Mikvah"}
      subtitle="Please provide accurate information so community members can easily find its location, contact details, and visiting information."
      steps={mikvahSteps}
      step={step}
      setStep={setStep}
      onDraft={saveDraft}
      onContinue={next}
      final={step === 5}
    >
      {error && (
        <div className="form-alert" role="alert">
          <Icon name="alert" />
          {error}
        </div>
      )}
      {step === 0 && (
        <>
          <SectionIntro title="Basic Information">
            Tell us the official name and exact location of the Mikvah.
          </SectionIntro>
          <FormField
            label="Mikvah Name"
            value={data.name}
            onChange={(value) => update("name", value)}
            placeholder="Enter the official Mikvah name"
            required
          />
          <AddressFields data={data} update={update} />
        </>
      )}
      {step === 1 && (
        <>
          <SectionIntro title="Contact & Rabbinical Information">
            These details may be public after approval. Confirm that you have
            permission to publish them.
          </SectionIntro>
          <div className="form-grid form-grid--2">
            <FormField
              label="Contact Person"
              value={data.contactPerson}
              onChange={(value) => update("contactPerson", value)}
              placeholder="Full name of primary contact"
            />
            <FormField
              label="Contact Telephone"
              value={data.contactPhone}
              onChange={(value) => update("contactPhone", value)}
              placeholder="(845) 555-0123"
              type="tel"
            />
            <FormField
              label="Rav / Hashgacha"
              value={data.rav}
              onChange={(value) => update("rav", value)}
              placeholder="Name of supervising Rav or Hashgacha"
            />
            <FormField
              label="Rav's Telephone"
              value={data.ravPhone}
              onChange={(value) => update("ravPhone", value)}
              type="tel"
            />
          </div>
          <Checkbox
            checked={data.permission === "yes"}
            onChange={(checked) => update("permission", checked ? "yes" : "")}
          >
            I have permission to publish the contact information provided.
          </Checkbox>
        </>
      )}
      {step === 2 && (
        <>
          <SectionIntro title="Appointments & Availability">
            Let visitors know whether arrangements are required and when the
            Mikvah operates.
          </SectionIntro>
          <fieldset className="choice-control">
            <legend>Appointment Required?</legend>
            <div>
              {["Yes", "No"].map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="appointment"
                    checked={data.appointmentRequired === option}
                    onChange={() => update("appointmentRequired", option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {data.appointmentRequired === "Yes" && (
            <div className="conditional-field">
              <FormField
                label="Appointment Telephone"
                value={data.appointmentPhone}
                onChange={(value) => update("appointmentPhone", value)}
                placeholder="Phone number for scheduling appointments"
                type="tel"
                required
              />
            </div>
          )}
          <fieldset className="choice-control">
            <legend>Operating Season</legend>
            <p>Season-specific hours can be entered in the next step.</p>
            <div>
              {["Year-Round", "Summer Only", "Winter Only"].map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="season"
                    checked={data.season === option}
                    onChange={() => update("season", option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      {step === 3 && (
        <>
          <SectionIntro title="Operating Hours">
            Use exact times where possible and notes when the schedule varies.
          </SectionIntro>
          {data.season !== "Winter Only" && (
            <HoursBlock
              title="Summer Hours"
              prefix="summer"
              data={data}
              update={update}
            />
          )}
          {data.season !== "Summer Only" && (
            <HoursBlock
              title="Winter Hours"
              prefix="winter"
              data={data}
              update={update}
            />
          )}
          <TextAreaField
            label="Friday / Erev Shabbos Hours"
            value={data.fridayHours}
            onChange={(value) => update("fridayHours", value)}
            placeholder="Enter Friday / Erev Shabbos opening hours or instructions"
          />
          <TextAreaField
            label="Motzei Shabbos Hours"
            value={data.motzeiHours}
            onChange={(value) => update("motzeiHours", value)}
            placeholder="Enter Motzei Shabbos hours or appointment instructions"
          />
        </>
      )}
      {step === 4 && (
        <>
          <SectionIntro title="Additional Information">
            Share practical details that will help visitors arrive prepared.
          </SectionIntro>
          <TextAreaField
            label="Additional Information / Special Instructions"
            value={data.additionalInfo}
            onChange={(value) => update("additionalInfo", value)}
            placeholder="Include entrance directions, appointment instructions, accessibility information, special arrangements, or anything visitors should know."
          />
          <div className="readonly-field">
            <span>Date Updated</span>
            <strong>{displayDate(existing?.updatedAt)}</strong>
            <small>
              This date is set automatically after a successful save or
              submission.
            </small>
          </div>
        </>
      )}
      {step === 5 && (
        <Review
          title={data.name || "Untitled Mikvah"}
          sections={[
            [
              "Basic Information",
              [
                [
                  "Full Address",
                  [data.address, data.city, data.state, data.zip]
                    .filter(Boolean)
                    .join(", "),
                ],
                ["Google Maps Location", data.mapLocation],
              ],
            ],
            [
              "Contact & Rabbinical",
              [
                ["Contact Person", data.contactPerson],
                ["Contact Telephone", data.contactPhone],
                ["Rav / Hashgacha", data.rav],
                ["Rav's Telephone", data.ravPhone],
              ],
            ],
            [
              "Appointments & Availability",
              [
                ["Appointment Required", data.appointmentRequired],
                [
                  "Appointment Telephone",
                  data.appointmentRequired === "Yes"
                    ? data.appointmentPhone
                    : "",
                ],
                ["Operating Season", data.season],
              ],
            ],
            [
              "Operating Hours",
              [
                ["Summer Hours", formatHours(data, "summer")],
                ["Winter Hours", formatHours(data, "winter")],
                ["Friday / Erev Shabbos", data.fridayHours],
                ["Motzei Shabbos", data.motzeiHours],
              ],
            ],
            [
              "Additional Information",
              [
                ["Special Instructions", data.additionalInfo],
                [
                  "Date Updated",
                  existing
                    ? displayDate(existing.updatedAt)
                    : "Set when submitted",
                ],
              ],
            ],
          ]}
          onEdit={setStep}
        >
          <Checkbox
            checked={data.confirmed === "yes"}
            onChange={(checked) => update("confirmed", checked ? "yes" : "")}
          >
            I confirm that the information provided is accurate and that I am
            authorized to submit and publish these details.
          </Checkbox>
        </Review>
      )}
    </FormShell>
  )
}

const formatHours = (data: Record<string, string>, prefix: string) =>
  [data[`${prefix}From`], data[`${prefix}To`]].filter(Boolean).join(" – ") +
  (data[`${prefix}Note`] ? ` · ${data[`${prefix}Note`]}` : "")

function HoursBlock({
  title,
  prefix,
  data,
  update,
}: {
  title: string
  prefix: string
  data: Record<string, string>
  update: (key: string, value: string) => void
}) {
  return (
    <div className="hours-block">
      <h3>{title}</h3>
      <div className="form-grid form-grid--2">
        <FormField
          label="From"
          type="time"
          value={data[`${prefix}From`]}
          onChange={(value) => update(`${prefix}From`, value)}
        />
        <FormField
          label="To"
          type="time"
          value={data[`${prefix}To`]}
          onChange={(value) => update(`${prefix}To`, value)}
        />
      </div>
      <FormField
        label="Schedule Note (optional)"
        value={data[`${prefix}Note`]}
        onChange={(value) => update(`${prefix}Note`, value)}
        placeholder="For example: By appointment after nightfall"
      />
    </div>
  )
}

function Review({
  title,
  sections,
  onEdit,
  children,
}: {
  title: string
  sections: Array<[string, Array<[string, string]>]>
  onEdit: (step: number) => void
  children: React.ReactNode
}) {
  return (
    <div className="review">
      <SectionIntro title="Review Your Submission">
        Check each section carefully before sending it to the directory team.
      </SectionIntro>
      <div className="review-title">
        <span>LISTING</span>
        <strong>{title}</strong>
        <StatusBadge status="Draft" />
      </div>
      {sections.map(([section, rows], index) => (
        <section key={section}>
          <div>
            <h3>{section}</h3>
            <button onClick={() => onEdit(index)}>Edit</button>
          </div>
          <dl>
            {rows
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
      <div className="authorization">{children}</div>
    </div>
  )
}

export function ShulForm({
  user,
  existing,
  onSave,
  navigate,
}: {
  user: User
  existing?: Listing
  onSave: (listing: Listing) => Promise<Listing>
  navigate: Navigate
}) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<Record<string, string>>({
    ...emptyShul,
    ...(existing?.data || {}),
    name: existing?.name || "",
    address: existing?.address || "",
    city: existing?.city || "",
    state: existing?.state || "NY",
    zip: existing?.zip || "",
    mapLocation: existing?.mapLocation || "",
  })
  const [locations, setLocations] = useState<AdditionalLocation[]>(
    existing?.locations || [],
  )
  const [primarySchedules, setPrimarySchedules] = useState(existing?.primarySchedules || [])
  const [error, setError] = useState("")
  const [showScheduleErrors, setShowScheduleErrors] = useState(false)
  const [scheduleFocusTarget, setScheduleFocusTarget] = useState<string | null>(
    null,
  )
  useEffect(() => {
    if (!scheduleFocusTarget) return
    document.getElementById(scheduleFocusTarget)?.focus()
    setScheduleFocusTarget(null)
  }, [locations, scheduleFocusTarget])
  const update = (key: string, value: string) => {
    setData(previous => ({ ...previous, [key]: value }))
    setError("")
  }
  const listing = (status: ListingStatus): Listing => ({
    versionId: existing?.versionId,
    versionNumber: existing?.versionNumber,
    id: existing?.id || `shul-${Date.now()}`,
    ownerId: user.id,
    ownerName: user.name,
    type: "Shul",
    name: data.name,
    address: data.address,
    city: data.city,
    state: data.state,
    zip: data.zip,
    mapLocation: data.mapLocation,
    status,
    createdAt: existing?.createdAt || today(),
    updatedAt: existing?.updatedAt || today(),
    submittedAt: status === "Pending Review" ? today() : existing?.submittedAt,
    data,
    primarySchedules,
    locations,
  })
  const next = async () => {
    if (saving) return
    if (
      step === 0 &&
      (!data.name || !data.address || !data.city || !data.state || !data.zip)
    )
      return setError("Please complete all required Shul information.")
    if (step === 2 || step === 4) {
      const hasInvalidSchedule = primarySchedules.some(schedule => Object.keys(validateMinyanSchedule(schedule)).length > 0) || locations.some((location) =>
        (location.schedules || []).some(
          (schedule) =>
            Object.keys(validateMinyanSchedule(schedule)).length > 0,
        ),
      )
      if (hasInvalidSchedule) {
        setShowScheduleErrors(true)
        setError("Please complete the highlighted Minyan schedule fields.")
        if (step === 4) setStep(2)
        return
      }
    }
    if (step === 4 && !data.confirmed)
      return setError(
        "Please confirm that the information is accurate and authorized.",
      )
    if (step < 4) setStep(step + 1)
    else {
      const item = listing("Pending Review")
      setSaving(true)
      try { const saved = await onSave(item); navigate("confirmation", saved.id) }
      catch (error) { setError(backendError(error)) } finally { setSaving(false) }
    }
  }
  const addLocation = () =>
    setLocations([
      ...locations,
      {
        id: createLocalId("location"),
        name: "",
        type: "Beis Medrash",
        address: "",
        schedules: [],
      },
    ])
  const changeLocation = (
    id: string,
    key: "name" | "type" | "address",
    value: string,
  ) =>
    setLocations(
      locations.map((location) =>
        location.id === id ? { ...location, [key]: value } : location,
      ),
    )
  const addMinyanSchedule = (locationId: string) => {
    const schedule = createMinyanSchedule()
    setLocations((current) =>
      current.map((location) =>
        location.id === locationId
          ? {
              ...location,
              schedules: [...(location.schedules || []), schedule],
            }
          : location,
      ),
    )
    setScheduleFocusTarget(`${locationId}-${schedule.id}-prayerType`)
    setError("")
  }
  const updateMinyanSchedule = (
    locationId: string,
    scheduleId: string,
    changes: Partial<MinyanSchedule>,
  ) => {
    setLocations((current) =>
      current.map((location) =>
        location.id === locationId
          ? {
              ...location,
              schedules: (location.schedules || []).map((schedule) =>
                schedule.id === scheduleId
                  ? { ...schedule, ...changes }
                  : schedule,
              ),
            }
          : location,
      ),
    )
    setError("")
  }
  const removeMinyanSchedule = (locationId: string, scheduleId: string) => {
    setLocations((current) =>
      current.map((location) =>
        location.id === locationId
          ? {
              ...location,
              schedules: (location.schedules || []).filter(
                (schedule) => schedule.id !== scheduleId,
              ),
            }
          : location,
      ),
    )
    setScheduleFocusTarget(`${locationId}-add-schedule`)
    setError("")
  }
  return (
    <FormShell
      busy={saving}
      title={existing ? "Edit Shul" : "Register a Shul"}
      subtitle="Help your community find accurate Shul information, Gabbai contact details, and Minyan locations."
      steps={shulSteps}
      step={step}
      setStep={setStep}
      onDraft={async () => {
        if (saving) return
        setSaving(true)
        try { await onSave(listing("Draft")); navigate("dashboard") }
        catch (error) { setError(backendError(error)) } finally { setSaving(false) }
      }}
      onContinue={next}
      final={step === 4}
    >
      {error && (
        <div className="form-alert" role="alert">
          <Icon name="alert" />
          {error}
        </div>
      )}
      {step === 0 && (
        <>
          <SectionIntro title="Shul Information">
            Enter the primary congregation name and main prayer location.
          </SectionIntro>
          <FormField
            label="Shul Name"
            value={data.name}
            onChange={(value) => update("name", value)}
            placeholder="Enter the official Shul name"
            required
          />
          <AddressFields data={data} update={update} />
        </>
      )}
      {step === 1 && (
        <>
          <SectionIntro title="Gabbai Information">
            These contact details may become public after approval.
          </SectionIntro>
          <div className="form-grid form-grid--2">
            <FormField
              label="Gabbai's Name"
              value={data.gabbaiName}
              onChange={(value) => update("gabbaiName", value)}
              placeholder="Enter the Gabbai's full name"
            />
            <FormField
              label="Gabbai's Telephone"
              value={data.gabbaiPhone}
              onChange={(value) => update("gabbaiPhone", value)}
              type="tel"
            />
          </div>
          <div className="privacy-callout">
            <Icon name="alert" />
            <p>
              <strong>Publication notice</strong>
              <span>
                Only submit contact information you are authorized to make
                public.
              </span>
            </p>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <SectionIntro title="Main Shul Schedule">Add the schedules for your primary prayer location.</SectionIntro>
          <MinyanScheduleEditor locationId="primary-form" locationLabel="Main Shul" schedules={primarySchedules} showErrors={showScheduleErrors}
            onAdd={() => setPrimarySchedules(current => [...current, createMinyanSchedule()])}
            onChange={(id, changes) => setPrimarySchedules(current => current.map(schedule => schedule.id === id ? { ...schedule, ...changes } : schedule))}
            onRemove={id => setPrimarySchedules(current => current.filter(schedule => schedule.id !== id))} />
          <SectionIntro title="Additional Minyan Locations">
            Add affiliated prayer spaces outside the Shul's primary location.
            This section is optional.
          </SectionIntro>
          <div className="locations-list">
            {locations.map((location, index) => (
              <article className="location-card" key={location.id}>
                <div className="location-card__head">
                  <span>
                    <Icon name="grip" /> Location {index + 1}
                  </span>
                  <button
                    onClick={() =>
                      window.confirm(
                        "Remove this location? Its entered information will be lost.",
                      ) &&
                      setLocations(
                        locations.filter((item) => item.id !== location.id),
                      )
                    }
                  >
                    <Icon name="trash" /> Remove
                  </button>
                </div>
                <div className="form-grid form-grid--2">
                  <FormField
                    label="Location Name"
                    value={location.name}
                    onChange={(value) =>
                      changeLocation(location.id, "name", value)
                    }
                    placeholder="Example: Main Beis Medrash"
                  />
                  <Select
                    label="Location Type"
                    value={location.type}
                    onChange={(value) =>
                      changeLocation(location.id, "type", value)
                    }
                    options={[
                      "Side room",
                      "Beis Medrash",
                      "Mesivta",
                      "Talmud Torah",
                      "Nearby building",
                      "Other affiliated location",
                    ]}
                  />
                </div>
                <AddressAutocomplete label="Address / GPS" required={false} value={location.address}
                  onChange={value => changeLocation(location.id, "address", value)}
                  onSelect={item => changeLocation(location.id, "address", item.formatted)} />
                <MinyanScheduleEditor
                  locationId={location.id}
                  locationLabel={`Location ${index + 1}${
                    location.name ? `, ${location.name}` : ""
                  }`}
                  schedules={location.schedules || []}
                  showErrors={showScheduleErrors}
                  onAdd={() => addMinyanSchedule(location.id)}
                  onChange={(scheduleId, changes) =>
                    updateMinyanSchedule(location.id, scheduleId, changes)
                  }
                  onRemove={(scheduleId) =>
                    removeMinyanSchedule(location.id, scheduleId)
                  }
                />
              </article>
            ))}
          </div>
          <CommunityButton variant="secondary" onClick={addLocation}>
            <Icon name="plus" /> Add Location
          </CommunityButton>
          {locations.length === 0 && (
            <p className="optional-note">
              No additional locations added. You can continue without one.
            </p>
          )}
        </>
      )}
      {step === 3 && (
        <>
          <SectionIntro title="Special Directions">
            Help visitors find the correct entrance, room, or affiliated Minyan
            location.
          </SectionIntro>
          <TextAreaField
            label="Additional Entrance or Location Instructions"
            value={data.specialDirections}
            onChange={(value) => update("specialDirections", value)}
            placeholder="Include special entrances, side doors, building access instructions, room numbers, or directions to additional Minyan locations."
          />
        </>
      )}
      {step === 4 && (
        <Review
          title={data.name || "Untitled Shul"}
          sections={[
            [
              "Shul Information",
              [
                [
                  "Main Address",
                  [data.address, data.city, data.state, data.zip]
                    .filter(Boolean)
                    .join(", "),
                ],
                ["GPS / Google Maps Location", data.mapLocation],
                ...primarySchedules.map((schedule, index): [string, string] => [
                  `Main Minyan ${index + 1}`,
                  formatMinyanSchedule(schedule),
                ]),
              ],
            ],
            [
              "Gabbai Information",
              [
                ["Gabbai's Name", data.gabbaiName],
                ["Gabbai's Telephone", data.gabbaiPhone],
              ],
            ],
            [
              "Additional Minyan Locations",
              locations.flatMap(
                (location, index): Array<[string, string]> => [
                  [
                    `Location ${index + 1}`,
                    [location.name, location.type, location.address]
                      .filter(Boolean)
                      .join(" · "),
                  ],
                  ...(location.schedules || []).map(
                    (schedule, scheduleIndex): [string, string] => [
                      `Minyan ${scheduleIndex + 1}`,
                      formatMinyanSchedule(schedule),
                    ],
                  ),
                ],
              ),
            ],
            ["Special Directions", [["Instructions", data.specialDirections]]],
          ]}
          onEdit={setStep}
        >
          <Checkbox
            checked={data.confirmed === "yes"}
            onChange={(checked) => update("confirmed", checked ? "yes" : "")}
          >
            I confirm that the information provided is accurate and that I am
            authorized to submit and publish these details.
          </Checkbox>
        </Review>
      )}
    </FormShell>
  )
}

export function ConfirmationPage({
  listing,
  navigate,
}: {
  listing?: Listing
  navigate: Navigate
}) {
  return (
    <main className="portal-page portal-page--center">
      <div className="success-panel">
        <span className="success-panel__icon">
          <Icon name="check" size={30} />
        </span>
        <p className="eyebrow">SUBMISSION RECEIVED</p>
        <h1>Thank You for Your Contribution!</h1>
        <p>
          Your listing has been submitted for review. We'll update its status
          once it has been reviewed.
        </p>
        {listing && (
          <div className="submission-summary">
            <span>
              <small>LISTING</small>
              <strong>{listing.name}</strong>
            </span>
            <span>
              <small>TYPE</small>
              <strong>{listing.type}</strong>
            </span>
            <StatusBadge status={listing.status} />
          </div>
        )}
        <div>
          <CommunityButton onClick={() => navigate("dashboard")}>
            Go to Dashboard
          </CommunityButton>
          <CommunityButton
            variant="secondary"
            onClick={() => navigate("add-listing")}
          >
            Add Another Listing
          </CommunityButton>
        </div>
      </div>
    </main>
  )
}

export function MikvahDirectory({ listings, navigate, initialQuery = "", initialOrigin }: { listings: Listing[]; navigate: Navigate; initialQuery?: string; initialOrigin?: [number, number] | null }) {
  const places = useMemo(() => listingPlaces(listings).filter(place => place.kind === "Mikvah"), [listings])
  return <main className="mikvah-directory-page">
    <section className="directory-hero"><div className="portal-container"><p className="eyebrow">TRUSTED COMMUNITY INFORMATION</p><h1>Find a Mikvah</h1><p>Explore approved Mikvah listings throughout the Catskills. Search an address or use your location to find nearby facilities.</p></div></section>
    <section className="directory-results"><div className="portal-container"><div className="section-title"><h2>Mikvah Listings</h2><CommunityButton variant="secondary" onClick={() => navigate("mikvah-form")}><Icon name="plus" /> Add a Mikvah</CommunityButton></div>
      <DirectoryExplorer places={places} initialOrigin={initialOrigin} initialQuery={initialQuery} onOpen={place => navigate(place.route, place.listingId)} />
    </div></section>
  </main>
}

export function MikvahDetail({
  listing,
  navigate,
}: {
  listing?: Listing
  navigate: Navigate
}) {
  if (!listing || listing.status !== "Published")
    return (
      <main className="portal-page portal-page--center mikvah-detail-page">
        <div className="public-empty">
          <h2>Listing unavailable</h2>
          <p>This listing is not publicly available.</p>
          <CommunityButton onClick={() => navigate("mikvah-directory")}>
            Back to Directory
          </CommunityButton>
        </div>
      </main>
    )
  const data = listing.data
  const rows: Array<[string, string]> = [
    ["Contact Person", data.contactPerson],
    ["Contact Telephone", data.contactPhone],
    ["Rav / Hashgacha", data.rav],
    ["Rav's Telephone", data.ravPhone],
    ["Appointment Required", data.appointmentRequired],
    [
      "Appointment Telephone",
      data.appointmentRequired === "Yes" ? data.appointmentPhone : "",
    ],
    ["Operating Season", data.season],
    ["Summer Hours", formatHours(data, "summer")],
    ["Winter Hours", formatHours(data, "winter")],
    ["Friday / Erev Shabbos Hours", data.fridayHours],
    ["Motzei Shabbos Hours", data.motzeiHours],
  ]
  return (
    <main className="mikvah-detail-page">
      <section className="detail-hero">
        <div className="portal-container">
          <button
            className="back-auth"
            onClick={() => navigate("mikvah-directory")}
          >
            ← Back to Mikvah directory
          </button>
          <p className="eyebrow">APPROVED MIKVAH</p>
          <h1>{listing.name}</h1>
          <p>
            {listing.address}, {listing.city}, {listing.state} {listing.zip}
          </p>
          <CommunityButton
            onClick={() =>
              window.open(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.mapLocation || `${listing.address}, ${listing.city}, ${listing.state}`)}`,
                "_blank",
              )
            }
          >
            Get Directions
          </CommunityButton>
        </div>
      </section>
      <div className="portal-container"><DirectoryExplorer compact places={listingPlaces([listing])} onOpen={() => {}} /></div>
      <section className="public-detail">
        <div className="portal-container public-detail__grid">
          <div>
            <h2>Visiting Information</h2>
            <dl>
              {rows
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            {data.additionalInfo && (
              <div className="instructions">
                <h3>Special Instructions</h3>
                <p>{data.additionalInfo}</p>
              </div>
            )}
          </div>
          <aside>
            <span>
              {data.sourceLabel
                ? "PUBLIC DIRECTORY SOURCE"
                : "LAST VERIFIED UPDATE"}
            </span>
            <strong>
              {data.sourceLabel || displayDate(listing.updatedAt)}
            </strong>
            <p>
              {data.sourceLabel
                ? `Information sourced from ${data.sourceLabel}. Please confirm details directly before visiting.`
                : "Information is provided by an authorized contributor and reviewed before publication."}
            </p>
            {data.sourceUrl && (
              <CommunityButton
                variant="secondary"
                onClick={() =>
                  window.open(data.sourceUrl, "_blank", "noopener,noreferrer")
                }
              >
                View Original Source
              </CommunityButton>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}

export function AddListingPage({ navigate }: { navigate: Navigate }) {
  return <OnboardingPage navigate={navigate} />
}
