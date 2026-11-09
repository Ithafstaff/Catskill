import { useEffect, useMemo, useRef, useState } from "react"
import {
  AccountPage,
  AddListingPage,
  CommunityPage,
  ConfirmationPage,
  DashboardPage,
  ForgotPage,
  Listing,
  LoginPage,
  MikvahDetail,
  MikvahDirectory,
  MikvahForm,
  OnboardingPage,
  ShulForm,
  SignupPage,
  User,
  VerifyPage,
} from "./Community"
import CommunityDate from "./LiveCommunityDate"
import DirectoryExplorer from "./DirectoryExplorer"
import { listingPlaces, shulPlaces } from "./lib/mapPlaces"
import MikvahHomePage, { mikvahHeroImage } from "./MikvahHome"
import { catskillsMikvahListings } from "./MikvahListings"
import { formatMinyanSchedule } from "./MinyanSchedule"
import ShulManagementPage from "./ShulManagement"
import useDafYomi from "./useDafYomi"
import useShabbos from "./useShabbos"
import { CANDLE_LIGHTING_MINUTES, SHABBOS_PERIODS, getPublishedShabbosRows } from "./shabbos"
import { catskillsShuls, type SourcedShul } from "./ShulListings"
import AdminWorkspace from "./AdminWorkspace"
import PasswordReset from "./PasswordReset"
import LegacyImport from "./LegacyImport"
import { supabase } from "./lib/supabase"
import { applicationUser, backendError, rpc, saveRemoteListing, updateProfile } from "./lib/backend"
import { createProfileSessionController } from "./authProfile"
import {
  initialAuthCallback,
  verifyAuthCallback,
  type CallbackState,
} from "./lib/authCallback"
import "./shuls.css"

type Page = "home" | "find" | "shul" | "shuls" | "shabbos" | CommunityPage
type Prayer = "Shacharis" | "Mincha" | "Maariv" | "Shabbos" | "Daf Yomi"

function isShulsDirectoryRoute() {
  return /^\/shuls\/?$/.test(window.location.pathname)
}

function readAppRoute(): { page: Page; selectedId?: string } {
  const path = window.location.pathname
  const review = path.match(/^\/admin\/review\/([^/]+)\/?$/)
  if (review) return { page: "admin-review", selectedId: review[1] }
  if (path === "/admin" || path === "/admin/") return { page: "admin" }
  if (/^\/auth\/reset-password\/?$/.test(path)) return { page: "reset-password" }
  if (/^\/auth\/confirm\/?$/.test(path))
    return { page: initialAuthCallback?.recovery ? "reset-password" : "verify" }
  if (path === "/verify") return { page: "verify" }
  if (path === "/forgot") return { page: "forgot" }
  if (path === "/login") return { page: "login" }
  if (path === "/signup") return { page: "signup" }
  if (path === "/find") return { page: "find" }
  if (/^\/shabbos\/?$/.test(path)) return { page: "shabbos" }
  if (path === "/mikvahs") return { page: "mikvah-directory" }
  const detail = path.match(/^\/(mikvahs|shuls)\/([^/]+)\/?$/)
  if (detail) { try { return { page: detail[1] === "mikvahs" ? "mikvah-detail" : "shul", selectedId: decodeURIComponent(detail[2]) } } catch { return { page: "home" } } }
  if (isShulsDirectoryRoute()) return { page: "shuls" }
  const shulId = readShulManagementRoute()
  if (shulId) return { page: "manage-shul", selectedId: shulId }
  return { page: "home" }
}

function readShulManagementRoute() {
  const match = window.location.pathname.match(
    /^\/contributor\/shuls\/([^/]+)\/?$/,
  )
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

interface IconProps {
  name: string
  size?: number
}

const Icon = ({ name, size = 18 }: IconProps) => {
  const paths: Record<string, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h3a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    locate: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    down: <path d="m7 10 5 5 5-5" />,
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

const Button = ({
  children,
  variant = "primary",
  icon,
  onClick,
  type = "button",
  className = "",
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "ghost" | "light"
  icon?: string
  onClick?: () => void
  type?: "button" | "submit"
  className?: string
}) => (
  <button
    type={type}
    className={`button button--${variant} ${className}`}
    onClick={onClick}
  >
    {icon && <Icon name={icon} />}
    {children}
  </button>
)

const TextLink = ({
  children,
  onClick,
  icon = "arrow",
  light = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  icon?: string
  light?: boolean
}) => (
  <button
    className={`text-link ${light ? "text-link--light" : ""}`}
    onClick={onClick}
  >
    {children}
    <Icon name={icon} size={16} />
  </button>
)

const Heading = ({
  children,
  level = 2,
  className = "",
}: {
  children: React.ReactNode
  level?: 1 | 2 | 3
  className?: string
}) => {
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements
  return (
    <Tag className={`heading heading--${level} ${className}`}>{children}</Tag>
  )
}

const Field = ({
  label,
  value,
  onChange,
  icon = "search",
  placeholder,
  className = "",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  icon?: string
  placeholder?: string
  className?: string
}) => (
  <label className={`field ${className}`}>
    <span className="sr-only">{label}</span>
    <Icon name={icon} />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </label>
)

const SelectField = ({
  label,
  value,
  options,
  icon,
}: {
  label: string
  value: string
  options: string[]
  icon?: string
}) => (
  <label className="select-field">
    {icon && <Icon name={icon} />}
    <span>
      <small>{label}</small>
      <select value={value} onChange={() => {}}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </span>
  </label>
)

const shuls = [
  {
    name: "Ahavas Torah",
    address: "456 Cedar Street, Catskills, NY",
    distance: "0.6 mi",
    walk: "12 min walk",
    next: "Mincha · 5:40 PM",
    image:
      "https://images.unsplash.com/photo-1584455897701-ed108e1e4eaa?auto=format&fit=crop&w=900&q=84",
  },
  {
    name: "Bais Medrash",
    address: "123 Maple Avenue, Catskills, NY",
    distance: "0.4 mi",
    walk: "8 min walk",
    next: "Shacharis · 7:00 AM",
    image:
      "https://images.unsplash.com/photo-1638824191272-e62e1edba81c?auto=format&fit=crop&w=900&q=84",
  },
  {
    name: "Kehillas Beis El",
    address: "82 Orchard Lane, Catskills, NY",
    distance: "0.9 mi",
    walk: "18 min walk",
    next: "Maariv · 8:15 PM",
    image:
      "https://images.unsplash.com/photo-1790090959826-5fc3ad41f35c?auto=format&fit=crop&w=900&q=84",
  },
]

const openDirections = (address: string) => {
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    "_blank",
    "noopener,noreferrer",
  )
}

const schedules: Record<string, Array<{
  time: string
  shul: string
  address: string
  distance: string
  walk: string
  status?: string
}>> = {
  Shacharis: [
    {
      time: "6:15 AM",
      shul: "Bais Medrash",
      address: "123 Maple Avenue, Catskills, NY",
      distance: "0.4 mi",
      walk: "8 min",
      status: "Next Minyan",
    },
    {
      time: "6:45 AM",
      shul: "Ahavas Torah",
      address: "456 Cedar Street, Catskills, NY",
      distance: "0.6 mi",
      walk: "12 min",
      status: "Starting Soon",
    },
    {
      time: "7:00 AM",
      shul: "Bais Medrash",
      address: "123 Maple Avenue, Catskills, NY",
      distance: "0.4 mi",
      walk: "8 min",
    },
    {
      time: "7:30 AM",
      shul: "Kehillas Beis El",
      address: "82 Orchard Lane, Catskills, NY",
      distance: "0.9 mi",
      walk: "18 min",
    },
    {
      time: "8:00 AM",
      shul: "Ohel Moshe",
      address: "210 Willow Court, Catskills, NY",
      distance: "1.1 mi",
      walk: "21 min",
    },
  ],
  Mincha: [
    {
      time: "1:35 PM",
      shul: "Bais Medrash",
      address: "123 Maple Avenue, Catskills, NY",
      distance: "0.4 mi",
      walk: "8 min",
      status: "Next Minyan",
    },
    {
      time: "5:40 PM",
      shul: "Ahavas Torah",
      address: "456 Cedar Street, Catskills, NY",
      distance: "0.6 mi",
      walk: "12 min",
    },
    {
      time: "5:45 PM",
      shul: "Kehillas Beis El",
      address: "82 Orchard Lane, Catskills, NY",
      distance: "0.9 mi",
      walk: "18 min",
    },
    {
      time: "6:00 PM",
      shul: "Ohel Moshe",
      address: "210 Willow Court, Catskills, NY",
      distance: "1.1 mi",
      walk: "21 min",
    },
  ],
  Maariv: [
    {
      time: "7:55 PM",
      shul: "Ahavas Torah",
      address: "456 Cedar Street, Catskills, NY",
      distance: "0.6 mi",
      walk: "12 min",
      status: "Next Minyan",
    },
    {
      time: "8:15 PM",
      shul: "Kehillas Beis El",
      address: "82 Orchard Lane, Catskills, NY",
      distance: "0.9 mi",
      walk: "18 min",
    },
    {
      time: "8:30 PM",
      shul: "Bais Medrash",
      address: "123 Maple Avenue, Catskills, NY",
      distance: "0.4 mi",
      walk: "8 min",
    },
    {
      time: "9:30 PM",
      shul: "Ohel Moshe",
      address: "210 Willow Court, Catskills, NY",
      distance: "1.1 mi",
      walk: "21 min",
    },
  ],
}

function Header({
  page,
  mikvahTone,
  navigate,
  user,
  onLogout,
}: {
  page: Page
  mikvahTone: boolean
  navigate: (page: Page, anchor?: string) => void
  user: User | null
  onLogout: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const items: Array<[string, Page, string?]> = [
    ["Home", "home"],
    ["Find a Minyan", "find"],
    ["Mikvahs", "mikvah-home"],
    ["Our Shuls", "shuls"],
    ["Shabbos", "shabbos"],
  ]
  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>(".nav__item.is-active")
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    const left =
      active.offsetLeft -
      nav.offsetLeft -
      (nav.clientWidth - active.clientWidth) / 2
    nav.scrollTo({ left, behavior: "smooth" })
  }, [page])
  useEffect(() => {
    if (!mobileNavOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [mobileNavOpen])
  return (
    <header className={`header${mikvahTone ? " header--mikvah" : ""}`}>
      <div className="header__inner">
        <button
          className="wordmark"
          onClick={() => navigate("home")}
          aria-label="Catskills Eruv home"
        >
          <span className="wordmark__mark">CE</span>
          <span>
            Catskills <b>Eruv</b>
          </span>
        </button>
        <nav
          ref={navRef}
          id="primary-navigation"
          className={`nav${mobileNavOpen ? " nav--open" : ""}`}
          aria-label="Primary navigation"
        >
          {items.map(([label, target, anchor]) => (
            <button
              key={label}
              className={`nav__item ${
                (page === target || (target === "mikvah-home" && mikvahTone)) &&
                !anchor
                  ? `is-active ${target === "mikvah-home" ? "is-mikvah" : ""}`
                  : ""
              }`}
              onClick={() => {
                navigate(target, anchor)
                setMobileNavOpen(false)
              }}
            >
              {label}
            </button>
          ))}
          {!user && (
            <div className="nav__auth">
              <button
                className="header-login"
                onClick={() => {
                  navigate("login")
                  setMobileNavOpen(false)
                }}
              >
                Log In
              </button>
              <Button
                onClick={() => {
                  navigate("signup")
                  setMobileNavOpen(false)
                }}
              >
                Sign Up
              </Button>
            </div>
          )}
        </nav>
        <div className="header__actions">
          <button
            className="icon-button"
            aria-label="Search"
            onClick={() => navigate("find")}
          >
            <Icon name="search" />
          </button>
          {!user ? (
            <>
              <button
                className="header-login"
                onClick={() => navigate("login")}
              >
                Log In
              </button>
              <Button onClick={() => navigate("signup")}>Sign Up</Button>
            </>
          ) : (
            <div className="profile-menu">
              <button
                className="profile-trigger"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
              >
                <span>
                  <Icon name="user" size={16} />
                </span>
                <b>{user.name}</b>
                <Icon name="down" size={14} />
              </button>
              {menuOpen && (
                <div className="profile-dropdown">
                  <button
                    onClick={() => {
                      navigate(user.role === "admin" ? "admin" : "dashboard")
                      setMenuOpen(false)
                    }}
                  >
                    {user.role === "admin" ? "Admin Review" : "Dashboard"}
                  </button>
                  {user.role !== "admin" && (
                    <>
                      <button
                        onClick={() => {
                          navigate("dashboard")
                          setMenuOpen(false)
                        }}
                      >
                        My Listings
                      </button>
                      <button
                        onClick={() => {
                          navigate("account")
                          setMenuOpen(false)
                        }}
                      >
                        Account Settings
                      </button>
                      <button
                        onClick={() => {
                          navigate("add-listing")
                          setMenuOpen(false)
                        }}
                      >
                        <Icon name="plus" size={14} /> Add Listing
                      </button>
                    </>
                  )}
                  <hr />
                  <button
                    onClick={() => {
                      onLogout()
                      setMenuOpen(false)
                    }}
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          aria-controls="primary-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <Icon name={mobileNavOpen ? "close" : "menu"} size={20} />
          <span>Menu</span>
        </button>
      </div>
    </header>
  )
}

function LocationSearch({
  location,
  setLocation,
  onSearch,
  useLocation,
  compact = false,
}: {
  location: string
  setLocation: (value: string) => void
  onSearch: () => void
  useLocation: () => void
  compact?: boolean
}) {
  return (
    <form
      className={`location-search ${compact ? "location-search--compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault()
        onSearch()
      }}
    >
      <Field
        label="Location"
        value={location}
        onChange={setLocation}
        icon="search"
        placeholder="Enter neighborhood, address, city, or ZIP"
      />
      <Button type="submit">Find Minyanim</Button>
      {!compact && (
        <Button variant="secondary" icon="locate" onClick={useLocation}>
          Use My Location
        </Button>
      )}
    </form>
  )
}

function PrayerTabs({
  selected,
  onChange,
}: {
  selected: Prayer
  onChange: (prayer: Prayer) => void
}) {
  const tabs: Prayer[] = [
    "Shacharis",
    "Mincha",
    "Maariv",
    "Shabbos",
    "Daf Yomi",
  ]
  return (
    <div className="prayer-tabs" role="tablist" aria-label="Prayer type">
      {tabs.map((tab) => (
        <button
          role="tab"
          aria-selected={selected === tab}
          className={selected === tab ? "is-active" : ""}
          key={tab}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  onAction,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Heading>{title}</Heading>
        {description && <p>{description}</p>}
      </div>
      {action && <TextLink onClick={onAction}>{action}</TextLink>}
    </div>
  )
}

function ScheduleRow({
  item,
  onShul,
  selected = false,
  onSelect,
}: {
  item: typeof schedules.Shacharis[0]
  onShul: () => void
  selected?: boolean
  onSelect?: () => void
}) {
  return (
    <article
      className={`schedule-row ${
        item.status
          ? `schedule-row--${item.status.toLowerCase().replace(/ /g, "-")}`
          : ""
      } ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (onSelect && (event.key === "Enter" || event.key === " ")) onSelect()
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
    >
      <div className="schedule-row__header">
        <div className="schedule-row__time">
          <small>Local time</small>
          <strong>
            {item.time.replace(/ (AM|PM)$/, "")}
            <span>{item.time.match(/(AM|PM)$/)?.[0]}</span>
          </strong>
        </div>
        <div className="schedule-row__shul">
          <strong>{item.shul}</strong>
          <span>{item.address}</span>
        </div>
      </div>
      <div className="schedule-row__travel">
        <span>
          <Icon name="pin" size={16} />
          {item.distance}
        </span>
        <span>
          <Icon name="clock" size={16} />
          {item.walk} walk
        </span>
      </div>
      <div className="schedule-row__status">
        {item.status && (
          <span className="status">
            <Icon
              name={item.status === "Next Minyan" ? "check" : "clock"}
              size={14}
            />
            {item.status}
          </span>
        )}
      </div>
      <div className="schedule-row__actions">
        <Button
          variant="ghost"
          icon="route"
          onClick={() => openDirections(item.address)}
        >
          Directions
        </Button>
        <Button
          variant="secondary"
          className="schedule-row__view"
          onClick={onShul}
        >
          View Shul
          <Icon name="arrow" size={15} />
        </Button>
      </div>
    </article>
  )
}

function Footer({
  mikvahTone,
  navigate,
}: {
  mikvahTone: boolean
  navigate: (page: Page, anchor?: string) => void
}) {
  return (
    <footer className={`footer${mikvahTone ? " footer--mikvah" : ""}`}>
      <div className="container footer__top">
        <h2 lang="he" dir="rtl">
          לע״נ ישראל דוב בן יצחק ז״ל
        </h2>
      </div>
      <div className="container footer__grid">
        <div className="footer__brand">
          <div className="wordmark wordmark--light">
            <span className="wordmark__mark">CE</span>
            <span>
              Catskills <b>Eruv</b>
            </span>
          </div>
          <p>
            Helping Catskills neighbors find prayer, community, and a place to
            gather.
          </p>
          <small>
            {mikvahTone
              ? "Hours and visiting requirements may change. Please confirm details with the Mikvah directly."
              : "Please confirm prayer times and any schedule changes with the shul directly."}
          </small>
        </div>
        <div>
          <strong>Explore</strong>
          <button onClick={() => navigate("find")}>Find a Minyan</button>
          <button onClick={() => navigate("mikvah-home")}>Mikvahs</button>
          <button onClick={() => navigate("shuls")}>Our Shuls</button>
          <button onClick={() => navigate("shabbos")}>Shabbos</button>
          <button onClick={() => navigate("home", "daf")}>Daf Yomi</button>
        </div>
        <div>
          <strong>Community</strong>
          <button onClick={() => navigate("home", "about")}>About</button>
          <button onClick={() => navigate("shul-form")}>Add a Shul</button>
          <button onClick={() => navigate("mikvah-form")}>Add a Mikvah</button>
          <button onClick={() => navigate("add-listing")}>
            Contributor Portal
          </button>
        </div>
        <div>
          <strong>Support</strong>
          <button>Accessibility</button>
          <button>Privacy</button>
        </div>
      </div>
      <div className="container footer__contact">
        <p>For More Info Please Email</p>
        <a href="mailto:eweiss@portairexpress.com">
          eweiss@portairexpress.com
        </a>
      </div>
      <div className="container footer__bottom">
        <span>© Catskills Eruv</span>
        <span>One Community. Many Minyanim. Always Together.</span>
      </div>
    </footer>
  )
}

function SourcedShulCard({
  shul,
  navigate,
}: {
  shul: SourcedShul
  navigate: (page: Page, anchor?: string) => void
}) {
  return (
    <article className="shul-card sourced-shul-card">
      <div className="shul-card__image">
        <img src={shul.photo} alt={`Exterior of ${shul.name}`} loading="lazy" />
      </div>
      <div className="shul-card__body">
        <p className="sourced-shul-card__credit">
          Photo:{" "}
          <a href={shul.photoSource} target="_blank" rel="noopener noreferrer">
            {shul.photoAuthor}
          </a>
          , {shul.photoYear} ·{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY-SA 3.0
          </a>{" "}
          · cropped
        </p>
        <Heading level={3}>{shul.name}</Heading>
        <p>{shul.address}</p>
        <div className="shul-card__next">
          <small>VISITING INFORMATION</small>
          <strong>Confirm prayer times before visiting</strong>
        </div>
        <div className="shul-card__actions">
          <Button
            variant="secondary"
            onClick={() => navigate("shul", `real:${shul.id}`)}
          >
            View Details
          </Button>
          <TextLink icon="route" onClick={() => openDirections(shul.address)}>
            Directions
          </TextLink>
        </div>
      </div>
    </article>
  )
}

function HomePage({
  prayer,
  setPrayer,
  location,
  setLocation,
  navigate,
  useLocation,
  listings,
  schedulesLoading,
  schedulesError,
}: {
  prayer: Prayer
  setPrayer: (value: Prayer) => void
  location: string
  setLocation: (value: string) => void
  navigate: (page: Page, anchor?: string) => void
  useLocation: () => void
  listings: Listing[]
  schedulesLoading: boolean
  schedulesError: boolean
}) {
  const dafYomi = useDafYomi()
  const shabbos = useShabbos()
  const featuredShabbos = !schedulesLoading && !schedulesError ? getPublishedShabbosRows(listings)[0] : undefined
  const activePrayer = schedules[prayer] ? prayer : "Shacharis"
  const approvedShuls = listings.filter(
    (item) => item.type === "Shul" && item.status === "Published",
  )
  const changePrayer = (value: Prayer) => {
    setPrayer(value)
    if (value === "Shabbos") navigate("shabbos")
    if (value === "Daf Yomi")
      setTimeout(
        () =>
          document
            .getElementById("daf")
            ?.scrollIntoView({ behavior: "smooth" }),
        50,
      )
  }
  return (
    <main>
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__copy">
            <p className="eyebrow">CATSKILLS ERUV · CATSKILLS, NY</p>
            <Heading level={1}>
              Find a Minyan
              <br />
              Near You
            </Heading>
            <p>
              Find nearby minyanim, discover local shuls, and view prayer
              schedules throughout the Catskills.
            </p>
          </div>
          <CommunityDate />
          <div className="hero__search">
            <LocationSearch
              location={location}
              setLocation={setLocation}
              onSearch={() => navigate("find")}
              useLocation={useLocation}
            />
            <div className="hero__filters">
              <SelectField
                label="Date"
                value="Today"
                options={["Today"]}
                icon="calendar"
              />
              <SelectField
                label="Prayer"
                value={prayer}
                options={["Shacharis", "Mincha", "Maariv"]}
              />
              <SelectField
                label="Distance"
                value="Within 2 miles"
                options={["Within 2 miles"]}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="prayer-nav">
        <div className="container">
          <span className="prayer-nav__label">Explore by prayer</span>
          <PrayerTabs selected={prayer} onChange={changePrayer} />
        </div>
      </section>

      <section className="section schedule-section">
        <div className="container">
          <SectionHeader
            eyebrow="UPCOMING NEAR YOU"
            title={`Today's ${activePrayer} Minyanim`}
            description={`${location || "Catskills, NY"} · Today · Within 2 miles · ${schedules[activePrayer].length} results`}
            action={`View All ${activePrayer} Minyanim`}
            onAction={() => navigate("find")}
          />
          <div className="schedule-list">
            {schedules[activePrayer].slice(0, 5).map((item) => (
              <ScheduleRow
                item={item}
                key={`${item.shul}-${item.time}`}
                onShul={() => navigate("shul")}
              />
            ))}
          </div>
          <div className="section-cta">
            <Button variant="secondary" onClick={() => navigate("find")}>
              View All Minyanim <Icon name="arrow" />
            </Button>
            <small>Times shown are sample application data.</small>
          </div>
        </div>
      </section>

      <section className="shabbos-feature">
        <div className="container shabbos-feature__grid">
          <div className="shabbos-feature__intro">
            <p className="eyebrow eyebrow--gold">THIS SHABBOS</p>
            <Heading>{shabbos?.reading || "Calendar unavailable"}</Heading>
            <p className="shabbos-date">
              {shabbos
                ? `${shabbos.saturdayLabel} · ${shabbos.hebrewDate}`
                : "Please retry shortly for this week’s calendar."}
            </p>
            <p>
              A quieter rhythm for the seventh day. Review candle lighting and
              schedules from each participating shul.
            </p>
            <div className="candle">
              <span className="candle__flame" />
              <span>
                <small>CANDLE LIGHTING · LOCAL TIME</small>
                <strong>{shabbos?.candleTime || "Unavailable"}</strong>
                {shabbos && <small>{shabbos.fridayLabel}</small>}
              </span>
            </div>
            <small className="data-note">
              Central Catskills · {CANDLE_LIGHTING_MINUTES} minutes before sunset.
              Calculated with{" "}
              <a href="https://www.hebcal.com/" target="_blank" rel="noreferrer">
                Hebcal
              </a>
              . Confirm local customs with your shul.
            </small>
          </div>
          <div className="shabbos-schedule">
            <div className="shabbos-schedule__head">
              <span>PARTICIPATING SHUL</span>
              <strong>{featuredShabbos?.name || "Community schedules"}</strong>
            </div>
            {featuredShabbos ? (
              SHABBOS_PERIODS.map((period) => {
                const services = featuredShabbos.services.filter(
                  (service) => service.period === period,
                )
                return services.length ? (
                  <div key={period}>
                    <span>{period}</span>
                    {services.map((service) => (
                      <p key={service.id}>
                        {service.prayer} <strong>{service.time}</strong>
                      </p>
                    ))}
                  </div>
                ) : null
              })
            ) : (
              <div>
                <p role="status">
                  {schedulesLoading
                    ? "Loading published schedules…"
                    : schedulesError
                      ? "Schedules are temporarily unavailable. Please retry the connection."
                      : "No Shabbos schedules have been published yet."}
                </p>
                <p>
                  Shul contributors can add service times and submit them for
                  review.
                </p>
              </div>
            )}
            <TextLink onClick={() => navigate("shabbos")}>
              View Full Shabbos Schedule
            </TextLink>
          </div>
        </div>
      </section>

      <section className="section" id="shuls">
        <div className="container">
          <SectionHeader
            eyebrow="PLACES TO GATHER"
            title="Our Shuls"
            description="Explore local shuls and confirm service times before visiting."
            action="Explore All Shuls"
            onAction={() => navigate("shuls")}
          />
          <div className="shul-grid">
            {catskillsShuls.map((shul) => (
              <SourcedShulCard key={shul.id} shul={shul} navigate={navigate} />
            ))}
            {approvedShuls.map((shul) => (
              <article className="shul-card" key={shul.id}>
                <div className="shul-card__image shul-card__image--verified">
                  <Icon name="pin" size={34} />
                  <span>Approved community listing</span>
                </div>
                <div className="shul-card__body">
                  <Heading level={3}>{shul.name}</Heading>
                  <p>
                    {shul.address}, {shul.city}, {shul.state} {shul.zip}
                  </p>
                  <div className="shul-card__meta">
                    <span>
                      <Icon name="check" size={16} />
                      Directory verified
                    </span>
                  </div>
                  <div className="shul-card__next">
                    <small>LISTING INFORMATION</small>
                    <strong>
                      {shul.locations?.length || 0} additional Minyan location
                      {shul.locations?.length === 1 ? "" : "s"}
                    </strong>
                  </div>
                  <div className="shul-card__actions">
                    <Button
                      variant="secondary"
                      onClick={() => navigate("shul", shul.id)}
                    >
                      View Shul
                    </Button>
                    <TextLink
                      icon="route"
                      onClick={() =>
                        openDirections(
                          shul.mapLocation ||
                            `${shul.address}, ${shul.city}, ${shul.state}`,
                        )
                      }
                    >
                      Directions
                    </TextLink>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="community-mikvah"
        aria-labelledby="community-mikvah-title"
      >
        <div className="container community-mikvah__inner">
          <div className="community-mikvah__copy">
            <p className="eyebrow">MIKVAHS IN OUR COMMUNITY</p>
            <h2 className="heading" id="community-mikvah-title">
              Find a Mikvah Near You
            </h2>
            <p>
              Explore community listings, visiting details, and contact
              information in one place.
            </p>
            <Button onClick={() => navigate("mikvah-home")}>
              Explore Mikvahs <Icon name="arrow" />
            </Button>
          </div>
          <img
            className="community-mikvah__image"
            src={mikvahHeroImage}
            alt="Stone arches reflected in a still pool"
            loading="lazy"
          />
        </div>
      </section>

      <section className="section daf-section" id="daf">
        <div className="container daf-card">
          <div>
            <p className="eyebrow">TODAY'S DAF YOMI</p>
            <Heading>A shared page of learning</Heading>
            <p>Join a nearby shiur and learn alongside your neighbors.</p>
            <small className="data-note">
              Daily schedule by{" "}
              <a
                href="https://www.hebcal.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Hebcal
              </a>{" "}
              ·{" "}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                CC BY 4.0
              </a>
            </small>
          </div>
          <div className="daf-values" aria-busy={dafYomi.loading}>
            {dafYomi.entry ? (
              <>
                <div>
                  <small>MASECHTA</small>
                  <strong>{dafYomi.entry.masechta}</strong>
                </div>
                <div>
                  <small>DAF</small>
                  <strong>{dafYomi.entry.daf}</strong>
                </div>
              </>
            ) : (
              <div className="daf-message" role="status">
                <span>
                  {dafYomi.loading
                    ? "Loading today's Daf Yomi…"
                    : "Today's Daf Yomi is temporarily unavailable."}
                </span>
                {dafYomi.error && (
                  <button
                    type="button"
                    className="daf-retry"
                    onClick={dafYomi.retry}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="community" id="about">
        <div className="container community__inner">
          <p className="eyebrow eyebrow--gold">ROOTED IN THE CATSKILLS</p>
          <Heading>
            One Kehillah.
            <br />
            Many Minyanim.
          </Heading>
          <p>
            Catskills Eruv helps neighbors discover nearby prayer opportunities
            and participating shuls—clearly, reliably, and without distraction.
          </p>
          <div className="community__principles">
            <span>Local shuls</span>
            <span>Reliable schedules</span>
            <span>Easy discovery</span>
            <span>Community connection</span>
          </div>
        </div>
      </section>
    </main>
  )
}

function FindPage({ listings, navigate, initialOrigin }: { initialOrigin?: [number, number] | null; listings: Listing[]; navigate: (page: Page, anchor?: string) => void }) {
  const [prayerFilter, setPrayerFilter] = useState("")
  const places = useMemo(() => shulPlaces(listings), [listings])
  return <main className="find-map-page"><div className="container">
    <p className="eyebrow">PRAYER DISCOVERY</p><h1>Find a Minyan</h1>
    <p>Explore shuls and published prayer schedules. Confirm service times with the shul before visiting.</p>
    <DirectoryExplorer findMode places={places} initialOrigin={initialOrigin} prayer={prayerFilter} onOpen={place => navigate(place.route, place.listingId)} prayerControls={<div className="prayer-tabs" role="group" aria-label="Filter published schedules">
      {["", "Shacharis", "Mincha", "Maariv", "Shabbos", "Daf Yomi"].map(prayer => <button key={prayer} aria-pressed={prayerFilter === prayer} className={prayerFilter === prayer ? "is-active" : ""} onClick={() => setPrayerFilter(prayer)}>{prayer || "All shuls"}</button>)}
    </div>} />
  </div></main>
}

function ShulsPage({
  listings,
  navigate,
}: {
  listings: Listing[]
  navigate: (page: Page, anchor?: string) => void
}) {
  const places = useMemo(() => shulPlaces(listings), [listings])
  return (
    <main className="shuls-directory">
      <section className="shuls-directory__hero">
        <div className="container shuls-directory__intro">
          <div>
            <h1>Find a shul in the Catskills.</h1>
            <p>Explore the map, find prayer schedules, and plan your visit.</p>
          </div>
          <Button onClick={() => navigate("shul-form")}>
            Register a Shul <Icon name="arrow" size={16} />
          </Button>
        </div>
      </section>
      <section className="shuls-directory__content" aria-labelledby="shuls-directory-heading">
        <div className="container">
          <div className="shuls-directory__heading">
            <h2 id="shuls-directory-heading">Our Shuls</h2>
          </div>
          <DirectoryExplorer
            places={places}
            onOpen={place => navigate(place.route, place.listingId)}
            shulsMode
          />
        </div>
      </section>
    </main>
  )
}

function ShulPage({
  navigate,
  listing,
  realShul,
  sampleShul = shuls[0],
}: {
  navigate: (page: Page, anchor?: string) => void
  listing?: Listing
  realShul?: SourcedShul
  sampleShul?: typeof shuls[number]
}) {
  if (realShul) {
    return (
      <main>
        <section className="detail-hero">
          <div className="container">
            <button className="back-link" onClick={() => navigate("shuls")}>
              <Icon name="arrow" /> Back to shuls
            </button>
            <div className="detail-hero__main">
              <div>
                <Heading level={1}>{realShul.name}</Heading>
                <p className="detail-address">
                  <Icon name="pin" />
                  {realShul.address}
                </p>
              </div>
              <Button
                icon="route"
                onClick={() => openDirections(realShul.address)}
              >
                Get Directions
              </Button>
            </div>
          </div>
        </section>
        <div className="container"><DirectoryExplorer compact places={shulPlaces([]).filter(place => place.listingId === `real:${realShul.id}`)} onOpen={() => {}} /></div>
        <section className="section sourced-shul-detail">
          <div className="container sourced-shul-detail__grid">
            <div>
              <img src={realShul.photo} alt={`Exterior of ${realShul.name}`} />
              <p className="sourced-shul-card__credit">
                Photo:{" "}
                <a
                  href={realShul.photoSource}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {realShul.photoAuthor}
                </a>
                , {realShul.photoYear} ·{" "}
                <a
                  href="https://creativecommons.org/licenses/by-sa/3.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CC BY-SA 3.0
                </a>{" "}
                · cropped
              </p>
            </div>
            <div className="sourced-shul-detail__information">
              <Heading level={2}>Plan your visit</Heading>
              <p>
                Prayer schedules and availability can change. Please confirm
                current times with the shul before visiting.
              </p>
              <div className="sourced-shul-detail__contact">
                <strong>Location</strong>
                <span>{realShul.address}</span>
                {realShul.phone && (
                  <>
                    <strong>Phone</strong>
                    <a href={`tel:${realShul.phone}`}>{realShul.phone}</a>
                  </>
                )}
              </div>
              <a
                className="text-link sourced-shul-detail__source"
                href={realShul.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                {realShul.sourceLabel} <Icon name="arrow" size={16} />
              </a>
            </div>
          </div>
        </section>
      </main>
    )
  }
  if (listing?.status === "Published") {
    const data = listing.data
    return (
      <main>
        <section className="detail-hero">
          <div className="container">
            <button className="back-link" onClick={() => navigate("shuls")}>
              <Icon name="arrow" /> Back to shuls
            </button>
            <div className="detail-hero__main">
              <div>
                <p className="eyebrow">APPROVED COMMUNITY SHUL</p>
                <Heading level={1}>{listing.name}</Heading>
                <p className="detail-address">
                  <Icon name="pin" />
                  {listing.address}, {listing.city}, {listing.state}{" "}
                  {listing.zip}
                </p>
                <div className="detail-meta">
                  <span>Directory verified</span>
                  <span>
                    Updated{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(listing.updatedAt))}
                  </span>
                </div>
              </div>
              <Button
                icon="route"
                onClick={() =>
                  openDirections(
                    listing.mapLocation ||
                      `${listing.address}, ${listing.city}, ${listing.state}`,
                  )
                }
              >
                Get Directions
              </Button>
            </div>
          </div>
        </section>
        <div className="container"><DirectoryExplorer compact places={listingPlaces([listing])} onOpen={place => navigate(place.route, place.listingId)} /></div>
        <section className="section detail-content">
          <div className="container detail-grid">
            <div>
              <SectionHeader
                eyebrow="PRAYER SPACES"
                title="Minyan Locations & Schedules"
                description="Prayer times and locations associated with this Shul."
              />
              {listing.primarySchedules?.length || listing.locations?.length ? (
                <div className="additional-public-locations">
                  {(listing.primarySchedules || []).length > 0 && (
                    <article>
                      <div>
                        <strong>Main Shul Location</strong>
                        <span>Primary prayer location</span>
                        <p>
                          {listing.address}, {listing.city}, {listing.state}{" "}
                          {listing.zip}
                        </p>
                        <div className="additional-public-locations__times">
                          <b>Minyan times</b>
                          {(listing.primarySchedules || []).map((schedule) => (
                            <p key={schedule.id}>
                              {formatMinyanSchedule(schedule)}
                              {schedule.notes && (
                                <small>{schedule.notes}</small>
                              )}
                            </p>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        icon="route"
                        onClick={() =>
                          openDirections(
                            listing.mapLocation ||
                              `${listing.address}, ${listing.city}, ${listing.state}`,
                          )
                        }
                      >
                        View on Map
                      </Button>
                    </article>
                  )}
                  {(listing.locations || []).map((location) => (
                    <article key={location.id}>
                      <div>
                        <strong>{location.name}</strong>
                        <span>{location.type}</span>
                        <p>{location.address}</p>
                        {(location.schedules || []).length > 0 && (
                          <div className="additional-public-locations__times">
                            <b>Minyan times</b>
                            {(location.schedules || []).map((schedule) => (
                              <p key={schedule.id}>
                                {formatMinyanSchedule(schedule)}
                                {schedule.notes && (
                                  <small>{schedule.notes}</small>
                                )}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        icon="route"
                        onClick={() => openDirections(location.address)}
                      >
                        View on Map
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="public-empty">
                  <Heading level={3}>No additional locations provided</Heading>
                  <p>
                    No Minyan schedules or additional locations have been
                    provided yet.
                  </p>
                </div>
              )}
              {data.specialDirections && (
                <div className="detail-block">
                  <Heading level={2}>
                    Additional Entrance or Location Instructions
                  </Heading>
                  <p>{data.specialDirections}</p>
                </div>
              )}
            </div>
            <aside className="detail-aside">
              <div>
                <small>APPROVED LISTING</small>
                <strong>Community Directory</strong>
                <span>Verified</span>
              </div>
              <div>
                <Heading level={3}>Gabbai Contact</Heading>
                {data.gabbaiName && <p>{data.gabbaiName}</p>}
                {data.gabbaiPhone && <p>{data.gabbaiPhone}</p>}
                {!data.gabbaiName && !data.gabbaiPhone && (
                  <p>No public Gabbai contact was provided.</p>
                )}
              </div>
            </aside>
          </div>
        </section>
      </main>
    )
  }
  const today = ["Shacharis", "Mincha", "Maariv"].flatMap((prayer) =>
    schedules[prayer]
      .filter((item) => item.shul === sampleShul.name)
      .map((item) => ({ ...item, prayer })),
  )
  const [samplePrayer, sampleTime] = sampleShul.next.split(" · ")
  return (
    <main>
      <section className="detail-hero">
        <div className="container">
          <button className="back-link" onClick={() => navigate("shuls")}>
            <Icon name="arrow" /> Back to shuls
          </button>
          <div className="detail-hero__main">
            <div>
              <p className="eyebrow">PARTICIPATING SHUL</p>
              <Heading level={1}>{sampleShul.name}</Heading>
              <p className="detail-address">
                <Icon name="pin" />
                {sampleShul.address}
              </p>
              <div className="detail-meta">
                <span>{sampleShul.distance} away</span>
                <span>{sampleShul.walk}</span>
                <span>Sample profile</span>
              </div>
            </div>
            <div>
              <Button
                icon="route"
                onClick={() => openDirections(sampleShul.address)}
              >
                Get Directions
              </Button>
            </div>
          </div>
        </div>
      </section>
      <section className="section detail-content">
        <div className="container detail-grid">
          <div>
            <SectionHeader
              eyebrow="WEEKDAY SCHEDULE"
              title="Today's Minyanim"
              description="Sample times · Please confirm with the shul."
            />
            <div className="timeline">
              {today.map((item, index) => (
                <div className="timeline__row" key={`${item.time}-${index}`}>
                  <span>{item.time}</span>
                  <div>
                    <strong>{item.prayer}</strong>
                    <small>
                      {index === 0 ? "Main Beis Medrash" : "Main Sanctuary"}
                    </small>
                  </div>
                  {index === 0 && <em>Sample</em>}
                </div>
              ))}
            </div>
            <div className="detail-block">
              <Heading level={2}>Shabbos Schedule</Heading>
              <p>
                Shul-specific times for this week. All values below are sample
                application data.
              </p>
              <div className="simple-schedule">
                <span>
                  Friday Mincha <strong>[sample time]</strong>
                </span>
                <span>
                  Shabbos Shacharis <strong>[sample time]</strong>
                </span>
                <span>
                  Shabbos Mincha <strong>[sample time]</strong>
                </span>
                <span>
                  Maariv <strong>[sample time]</strong>
                </span>
              </div>
              <TextLink onClick={() => navigate("shabbos")}>
                View complete Shabbos schedule
              </TextLink>
            </div>
          </div>
          <aside className="detail-aside">
            <div>
              <small>NEXT MINYAN · SAMPLE</small>
              <strong>{samplePrayer}</strong>
              <span>{sampleTime}</span>
              <Button
                icon="route"
                onClick={() => openDirections(sampleShul.address)}
              >
                Directions
              </Button>
            </div>
            <div>
              <Heading level={3}>About</Heading>
              <p>
                This example profile illustrates how a shul listing and its
                schedules can appear in the directory.
              </p>
            </div>
            <div>
              <Heading level={3}>Contact</Heading>
              <p>
                Contact information will be published after verification by the
                shul.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

function ShabbosPage({
  navigate,
  listings,
  loading,
  error,
  onRetry,
}: {
  navigate: (page: Page, anchor?: string) => void
  listings: Listing[]
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const calendar = useShabbos()
  const rows = getPublishedShabbosRows(listings)
  return (
    <main className="shabbos-page">
      <section className="shabbos-hero">
        <div className="container shabbos-hero__grid">
          <div>
            <p className="eyebrow eyebrow--gold">THE SEVENTH DAY</p>
            <Heading level={1}>This Shabbos</Heading>
            <p>
              Candle lighting for the central Catskills and published Shabbos
              schedules from our community’s shuls.
            </p>
            <small className="data-note data-note--light">
              Central Catskills, NY · {CANDLE_LIGHTING_MINUTES} minutes before
              sunset · New York time. Calendar calculated with{" "}
              <a
                href="https://www.hebcal.com/"
                target="_blank"
                rel="noreferrer"
              >
                Hebcal
              </a>
              .
            </small>
          </div>
          <div className="shabbos-hero__summary">
            <span>THIS WEEK’S READING</span>
            <strong>{calendar?.reading || "Calendar unavailable"}</strong>
            {calendar ? (
              <p>
                <time dateTime={calendar.saturdayISO}>
                  {calendar.saturdayLabel}
                </time>
                <br />
                {calendar.hebrewDate}
              </p>
            ) : (
              <p>
                We could not calculate this week’s calendar. Please check again
                shortly.
              </p>
            )}
            <div>
              <span className="candle__flame" />
              <span>
                <small>CANDLE LIGHTING</small>
                {calendar ? (
                  <>
                    <b>
                      <time dateTime={calendar.candleISO}>
                        {calendar.candleTime}
                      </time>
                    </b>
                    <span>{calendar.fridayLabel}</span>
                  </>
                ) : (
                  <b>Unavailable</b>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <SectionHeader
            eyebrow="NEIGHBORHOOD SCHEDULES"
            title="Participating Shuls"
            description="Recurring schedules supplied by shul contributors and approved for publication. All service times are local to the shul; confirm holiday changes directly."
          />
          {loading || error || !rows.length ? (
            <div className="shabbos-empty">
              <Heading level={3}>
                {loading
                  ? "Loading Shabbos schedules…"
                  : error
                    ? "Schedules are temporarily unavailable"
                    : "No Shabbos schedules published yet"}
              </Heading>
              <p role="status">
                {loading
                  ? "Checking the published community directory."
                  : error
                    ? "We could not load the published directory. Please retry or contact your shul for service times."
                    : "Shul contributors can add Shabbos services through the Contributor Portal. Schedules appear here after admin approval."}
              </p>
              {!loading &&
                (error ? (
                  <Button variant="secondary" onClick={onRetry}>
                    Retry schedules
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => navigate("shul-form")}
                  >
                    Add Your Shul’s Schedule
                  </Button>
                ))}
            </div>
          ) : (
            <>
              <p className="shabbos-table__hint">
                Swipe sideways to see all prayer times.
              </p>
              <div
                className="shabbos-table"
                role="region"
                aria-label="Participating shuls schedule"
                tabIndex={0}
              >
                <div
                  role="table"
                  aria-label="Published recurring Shabbos services"
                >
                  <div className="shabbos-table__head" role="row">
                    <span role="columnheader">Shul</span>
                    {SHABBOS_PERIODS.map((period) => (
                      <span role="columnheader" key={period}>
                        {period}
                      </span>
                    ))}
                    <span role="columnheader">
                      <span className="sr-only">Details</span>
                    </span>
                  </div>
                  {rows.map((row) => (
                    <div className="shabbos-table__row" role="row" key={row.id}>
                      <span role="cell">
                        <strong>{row.name}</strong>
                        <small>{row.address}</small>
                      </span>
                      {SHABBOS_PERIODS.map((period) => {
                        const services = row.services.filter(
                          (service) => service.period === period,
                        )
                        return (
                          <span
                            role="cell"
                            className="shabbos-table__services"
                            key={period}
                          >
                            <span className="shabbos-period-label">{period}</span>
                            {services.length ? (
                              services.map((service) => (
                                <span
                                  className="shabbos-service"
                                  key={service.id}
                                >
                                  <b>{service.prayer}</b>
                                  <span>{service.time}</span>
                                  {service.notes && (
                                    <small>{service.notes}</small>
                                  )}
                                </span>
                              ))
                            ) : (
                              <span className="shabbos-not-published">
                                Not published
                              </span>
                            )}
                          </span>
                        )
                      })}
                      <span role="cell">
                        <Button
                          variant="secondary"
                          onClick={() => navigate("shul", row.listingId)}
                        >
                          View Shul
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="shabbos-reminder">
            <div>
              <Heading level={3}>A note about local times</Heading>
              <p>
                Candle lighting is calculated for the site’s central Catskills
                reference (41.65° N, 74.65° W), {CANDLE_LIGHTING_MINUTES}{" "}
                minutes before sunset. Times vary by town and local custom.
                Confirm with your shul before relying on this regional
                reference. Service schedules are recurring; contact the
                congregation about holiday or seasonal changes.
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate("shul-form")}>
              Contribute a Schedule
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

function LocationModal({
  onClose,
  onAllow,
}: {
  onClose: () => void
  onAllow: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Use your location"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <span className="modal__icon">
          <Icon name="locate" size={28} />
        </span>
        <Heading level={2} className="modal__title">
          Use your location?
        </Heading>
        <p>
          We’ll use your approximate location to show nearby minyanim. Your
          location is only used for this search.
        </p>
        <div>
          <Button onClick={onAllow}>Allow Location</Button>
          <Button variant="ghost" onClick={onClose}>
            Not Now
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [initialRoute] = useState(readAppRoute)
  const [page, setPage] = useState<Page>(() =>
    initialRoute.page,
  )
  const [prayer, setPrayer] = useState<Prayer>("Shacharis")
  const [location, setLocation] = useState("Catskills, NY")
  const [mapOrigin, setMapOrigin] = useState<[number, number] | null>(null)
  const [locationFeedback, setLocationFeedback] = useState("")
  const [locationModal, setLocationModal] = useState(false)
  const [intent, setIntent] = useState<string | undefined>(initialAuthCallback?.intent)
  const [verificationEmail, setVerificationEmail] = useState("")
  const [callbackState, setCallbackState] = useState<CallbackState>({
    status: initialAuthCallback?.isCallback ? "verifying" : "idle",
  })
  const callbackTask = useRef<Promise<CallbackState> | null>(null)
  const callbackAbandoned = useRef(false)
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialRoute.selectedId,
  )
  const [mikvahQuery, setMikvahQuery] = useState("")
  const [user, setUserState] = useState<User | null>(null)
  const authController = useRef<ReturnType<typeof createProfileSessionController> | null>(null)
  const [listingsIdentity, setListingsIdentity] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [recoveryAllowed, setRecoveryAllowed] = useState(false)
  const [backendNotice, setBackendNotice] = useState("")
  const [publicListings, setPublicListings] = useState<Listing[]>(catskillsMikvahListings)
  const [listings, setListings] = useState<Listing[]>([])
  const listingsRef = useRef(listings)
  const requestSequence = useRef(0)
  const userRef = useRef(user)
  userRef.current = user
  listingsRef.current = listings
  const setUser = (profile: User | null) => {
    if (profile) authController.current?.adopt(profile)
    userRef.current = profile
    setUserState(profile)
  }
  useEffect(() => {
    const controller = createProfileSessionController({
      load: applicationUser,
      onChange: state => {
        userRef.current = state.user
        setUserState(state.user)
        setAuthLoading(state.loading)
        if (state.error) setBackendNotice(state.error)
      },
      onIdentityChange: () => {
        setRecoveryAllowed(false)
        ++requestSequence.current
        userRef.current = null
        listingsRef.current = []
        setListings([])
        setListingsIdentity(null)
        setDataLoading(false)
      },
    })
    authController.current = controller
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      controller.receive(next?.user || null)
      if (event === "SIGNED_OUT" || !next) setRecoveryAllowed(false)
      if (event === "PASSWORD_RECOVERY" && next) {
        setRecoveryAllowed(true)
        setPage("reset-password")
        window.history.replaceState({ page: "reset-password" }, "", "/auth/reset-password")
      }
    })
    return () => { subscription.unsubscribe(); controller.stop(); authController.current = null }
  }, [])
  useEffect(() => {
    const callback = initialAuthCallback
    if (!callback?.isCallback) return
    let active = true
    // StrictMode remounts effects; a one-use token must only be exchanged once.
    callbackTask.current ??= verifyAuthCallback(callback, supabase.auth)
    void callbackTask.current.then(result => {
      if (!active || callbackAbandoned.current) return
      setCallbackState(result)
      if (callback.recovery) {
        setRecoveryAllowed(result.status === "verified")
        setPage("reset-password")
        window.history.replaceState({ page: "reset-password" }, "", "/auth/reset-password")
      }
    })
    return () => { active = false }
  }, [])
  const refreshData = async () => {
    const actor = userRef.current
    const sequence = ++requestSequence.current
    setDataLoading(true)
    try {
      const [published, own] = await Promise.all([
        rpc<Listing[]>("directory_listings"),
        actor ? rpc<Listing[]>(actor.role === "admin" ? "admin_listings" : "my_listings") : Promise.resolve([]),
      ])
      // Ignore a response belonging to an account that signed out/switched.
      if (userRef.current?.id !== actor?.id || userRef.current?.role !== actor?.role || sequence !== requestSequence.current) return
      setPublicListings(published); setListings(own); setListingsIdentity(actor ? `${actor.id}:${actor.role}` : null); setBackendNotice("")
    } catch (error) { if (sequence === requestSequence.current) setBackendNotice(backendError(error)); throw error }
    finally { if (sequence === requestSequence.current) setDataLoading(false) }
  }
  useEffect(() => { void refreshData().catch(() => {}) }, [user?.id, user?.role])

  useEffect(() => {
    const restoreRoute = () => {
      const route = readAppRoute()
      if (route.page !== "home") { setSelectedId(route.selectedId); setPage(route.page); return }
      const state = window.history.state as {
        page?: Page
        selectedId?: string
      } | null
      setSelectedId(state?.selectedId)
      setPage(state?.page || "home")
    }
    window.addEventListener("popstate", restoreRoute)
    return () => window.removeEventListener("popstate", restoreRoute)
  }, [])

  const navigate = (target: Page, anchor?: string) => {
    callbackAbandoned.current = true
    const privatePages: Page[] = [
      "dashboard",
      "account",
      "add-listing",
      "mikvah-form",
      "shul-form",
      "manage-shul",
    ]
    const adminPages: Page[] = ["admin", "admin-review"]
    const completingAuthentication = ["login", "signup", "verify"].includes(
      page,
    )
    if (privatePages.includes(target) && !user && !completingAuthentication) {
      setIntent(
        (target === "manage-shul" ? "shul" : anchor) ||
          (target === "mikvah-form"
            ? "mikvah"
            : target === "shul-form"
              ? "shul"
              : undefined),
      )
      if (isShulsDirectoryRoute())
        window.history.pushState({ page: "login" }, "", "/")
      setPage("login")
      window.scrollTo(0, 0)
      return
    }
    if (
      adminPages.includes(target) &&
      user?.role !== "admin" &&
      !completingAuthentication
    ) {
      setPage(user ? "dashboard" : "login")
      window.scrollTo(0, 0)
      return
    }
    if (
      [
        "admin-review",
        "mikvah-detail",
        "confirmation",
        "mikvah-form",
        "shul-form",
        "manage-shul",
        "shul",
      ].includes(target) &&
      anchor
    )
      setSelectedId(anchor)
    if ((target === "mikvah-form" || target === "shul-form") && !anchor)
      setSelectedId(undefined)
    if (target === "shul" && !anchor) setSelectedId(undefined)
    if (target === "login" || target === "signup") setIntent(anchor)
    else if ((target === "verify" || target === "forgot") && anchor) setIntent(anchor)
    if (target !== page) setCallbackState({ status: "idle" })

    const path = target === "shabbos" ? "/shabbos" : target === "find" ? "/find" : target === "mikvah-directory" ? "/mikvahs" : target === "mikvah-detail" && anchor ? `/mikvahs/${encodeURIComponent(anchor)}` : target === "shul" && anchor ? `/shuls/${encodeURIComponent(anchor)}` : target === "shuls" ? "/shuls" : target === "admin" ? "/admin" : target === "admin-review" && anchor ? `/admin/review/${encodeURIComponent(anchor)}` : target === "manage-shul" && anchor ? `/contributor/shuls/${encodeURIComponent(anchor)}` : target === "verify" ? "/verify" : target === "forgot" ? "/forgot" : target === "login" ? "/login" : target === "signup" ? "/signup" : target === "reset-password" ? "/auth/reset-password" : "/"
    window.history.pushState({ page: target, selectedId: anchor }, "", path)
    setPage(target)
    window.scrollTo(0, 0)
    if (target === "home" && anchor)
      setTimeout(
        () =>
          document
            .getElementById(anchor)
            ?.scrollIntoView({ behavior: "smooth" }),
        50,
      )
  }
  const saveListing = async (listing: Listing) => {
    const actorId = userRef.current?.id
    const saved = await saveRemoteListing(listing)
    if (userRef.current?.id === actorId) setListings(current => [...current.filter(item => item.id !== saved.id), saved])
    return saved
  }
  const updateOwnedShul = async (shulId: string, update: (current: Listing) => Listing) => {
    const existing = listingsRef.current.find(item => item.id === shulId && item.ownerId === user?.id)
    if (!existing) return false
    const updated = update(existing)
    if (updated === existing) return false
    await saveListing({ ...updated, updatedAt: existing.updatedAt })
    return true
  }
  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) return setBackendNotice(backendError(error))
    setUser(null); setListings([]); setPage("home")
    window.history.replaceState({ page: "home" }, "", "/")
  }
  const content = (() => {
    if (page === "shuls") return <ShulsPage listings={publicListings} navigate={navigate} />
    if (page === "reset-password")
      return <PasswordReset navigate={navigate} allowed={recoveryAllowed} callback={callbackState} />
    if ((page === "admin" || page === "admin-review")) {
      if (authLoading) return <main className="portal-page"><p role="status">Checking your account…</p></main>
      if (!user) return <LoginPage navigate={navigate} onLogin={setUser} />
      if (user.role !== "admin") return <main className="portal-page"><h1>Administrator access required</h1><p>Your account does not have permission to review listings.</p></main>
      if (dataLoading && !listings.length) return <main className="portal-page"><p role="status">Loading submissions…</p></main>
      return <AdminWorkspace listings={listings} selectedId={page === "admin-review" ? selectedId : undefined} navigate={navigate} onRefresh={refreshData} />
    }
    const protectedPages = ["dashboard", "account", "add-listing", "mikvah-form", "shul-form", "manage-shul", "onboarding", "confirmation"]
    if (protectedPages.includes(page)) {
      if (authLoading && !user) return <main className="portal-page"><p role="status">Loading your account…</p></main>
      if (!user) return <LoginPage navigate={navigate} onLogin={setUser} intent={intent} />
      if (listingsIdentity !== `${user.id}:${user.role}`) return <main className="portal-page"><p role="status">{dataLoading ? "Loading your listings…" : "Your listings could not be loaded. Please retry."}</p>{!dataLoading && <button className="button button--secondary" onClick={() => { void refreshData().catch(() => {}) }}>Retry</button>}</main>
    }
    if (page === "find")
      return (
        <FindPage initialOrigin={mapOrigin} listings={publicListings} navigate={navigate} />
      )
    if (page === "shul")
      return (
        <ShulPage
          navigate={navigate}
          listing={publicListings.find((item) => item.id === selectedId)}
          realShul={catskillsShuls.find(
            (item) => `real:${item.id}` === selectedId,
          )}
          sampleShul={shuls.find(
            (item) => `sample:${item.name}` === selectedId,
          )}
        />
      )
    if (page === "shabbos") return <ShabbosPage navigate={navigate} listings={publicListings} loading={dataLoading} error={!!backendNotice} onRetry={() => { void refreshData().catch(() => {}) }} />
    if (page === "login" && user) return <main className="portal-page portal-page--center"><section className="auth-card"><h1>You’re signed in</h1><p>Your email is confirmed and your account is ready.</p><button className="button button--primary" onClick={() => navigate(user.role === "admin" ? "admin" : "dashboard")}>Continue to {user.role === "admin" ? "admin dashboard" : "your dashboard"}</button></section></main>
    if (page === "login")
      return <LoginPage navigate={navigate} onLogin={setUser} intent={intent} />
    if (page === "signup")
      return (
        <SignupPage
          navigate={navigate}
          intent={intent}
          onVerificationEmail={setVerificationEmail}
        />
      )
    if (page === "forgot")
      return <ForgotPage navigate={navigate} intent={intent} />
    if (page === "verify")
      return (
        <VerifyPage
          navigate={navigate}
          intent={intent}
          email={verificationEmail}
          callback={callbackState}
          user={user}
          profileLoading={authLoading}
          emailChange={initialAuthCallback?.type === "email_change"}
        />
      )
    if (page === "onboarding") return <OnboardingPage navigate={navigate} />
    if (page === "dashboard" && user)
      return (
        <DashboardPage
          user={user}
          listings={listings}
          navigate={navigate}
          onDelete={async id => {
            const item = listings.find(l => l.id === id)
            await rpc("delete_draft", { p_listing_id: id, p_expected_version: item?.versionId })
            await refreshData()
          }}
        />
      )
    if (page === "manage-shul") {
      if (!user)
        return <LoginPage navigate={navigate} onLogin={setUser} intent="shul" />
      return (
        <ShulManagementPage
          listing={listings.find(
            (item) =>
              item.id === selectedId &&
              item.type === "Shul" &&
              item.ownerId === user.id,
          )}
          navigate={navigate}
          onUpdate={(update) =>
            selectedId ? updateOwnedShul(selectedId, update) : Promise.resolve(false)
          }
        />
      )
    }
    if (page === "account" && user)
      return (
        <AccountPage
          user={user}
          navigate={navigate}
          onUpdate={async draft => { setUser(await updateProfile(draft)) }}
          onLogout={logout}
        />
      )
    if (page === "add-listing") return <AddListingPage navigate={navigate} />
    if (page === "mikvah-form" && user)
      return (
        <MikvahForm
          key={`${user.id}:${selectedId || "new"}`}
          user={user}
          existing={listings.find(
            (item) => item.id === selectedId && item.ownerId === user.id,
          )}
          onSave={saveListing}
          navigate={navigate}
        />
      )
    if (page === "shul-form" && user)
      return (
        <ShulForm
          key={`${user.id}:${selectedId || "new"}`}
          user={user}
          existing={listings.find(
            (item) => item.id === selectedId && item.ownerId === user.id,
          )}
          onSave={saveListing}
          navigate={navigate}
        />
      )
    if (page === "confirmation")
      return (
        <ConfirmationPage
          listing={listings.find((item) => item.id === selectedId)}
          navigate={navigate}
        />
      )
    if (page === "mikvah-home")
      return (
        <MikvahHomePage
          listings={publicListings}
          isLoggedIn={Boolean(user)}
          navigate={navigate}
          onNear={coordinates => { setMapOrigin(coordinates); setMikvahQuery(""); navigate("mikvah-directory") }}
          onSearch={(query) => {
            setMapOrigin(null)
            setMikvahQuery(query)
            navigate("mikvah-directory")
          }}
        />
      )
    if (page === "mikvah-directory")
      return (
        <MikvahDirectory
          listings={publicListings}
          navigate={navigate}
          initialQuery={mikvahQuery}
          initialOrigin={mapOrigin}
        />
      )
    if (page === "mikvah-detail")
      return (
        <MikvahDetail
          listing={publicListings.find((item) => item.id === selectedId)}
          navigate={navigate}
        />
      )
    return (
      <HomePage
        prayer={prayer}
        setPrayer={setPrayer}
        location={location}
        setLocation={setLocation}
        navigate={navigate}
        useLocation={() => setLocationModal(true)}
        listings={publicListings}
        schedulesLoading={dataLoading}
        schedulesError={!!backendNotice}
      />
    )
  })()
  const mikvahTone =
    page.startsWith("mikvah-") ||
    (intent === "mikvah" &&
      ["login", "signup", "forgot", "verify"].includes(page))
  return (
    <div className="app">
      <Header
        page={page}
        mikvahTone={mikvahTone}
        navigate={navigate}
        user={user}
        onLogout={logout}
      />
      {locationFeedback && <p className="backend-notice" role="status">{locationFeedback}</p>}
      {backendNotice && <div className="backend-notice" role="alert">{backendNotice}<button onClick={() => { void refreshData().catch(() => {}) }}>Retry connection</button></div>}
      {user && page === "dashboard" && <div style={{ width: "min(1100px, calc(100% - 32px))", margin: "24px auto" }}><LegacyImport user={user} onImported={refreshData} /></div>}
      {content}
      <Footer mikvahTone={mikvahTone} navigate={navigate} />
      {locationModal && (
        <LocationModal
          onClose={() => setLocationModal(false)}
          onAllow={() => {
            setLocationModal(false)
            if (!navigator.geolocation) { setLocationFeedback("Location is unavailable. Search for an address on the map instead."); navigate("find"); return }
            setLocationFeedback("Finding your location…")
            navigator.geolocation.getCurrentPosition(position => {
              setMapOrigin([position.coords.longitude, position.coords.latitude]); setLocation("Current location"); setLocationFeedback(""); navigate("find")
            }, () => { setLocationFeedback("Your location could not be accessed. Search for an address on the map instead."); navigate("find") }, { timeout: 10000, maximumAge: 60000 })
          }}
        />
      )}
    </div>
  )
}
