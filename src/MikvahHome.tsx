import { useMemo, useState } from "react"
import { CommunityButton, CommunityPage, Listing } from "./Community"

type MikvahHomeProps = {
  listings: Listing[]
  isLoggedIn: boolean
  navigate: (
    page: CommunityPage | "home" | "find" | "shul" | "shabbos",
    intent?: string,
  ) => void
  onNear: (coordinates: [number, number]) => void
  onSearch: (query: string) => void
}

export const mikvahHeroImage =
  "https://images.unsplash.com/photo-1769538555574-dec262b7bab3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=84&w=1200"

const MikvahIcon = ({
  name,
  size = 20,
}: {
  name: "pin" | "clock" | "calendar" | "info" | "search" | "locate" | "arrow" | "water"
  size?: number
}) => {
  const paths: Record<string, React.ReactNode> = {
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
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
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    locate: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
    water: (
      <>
        <path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11Z" />
        <path d="M9 15c.5 1.3 1.5 2 3 2" />
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
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

const MikvahHeading = ({
  level,
  children,
}: {
  level: 1 | 2 | 3
  children: React.ReactNode
}) => {
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements
  return <Tag>{children}</Tag>
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="mikvah-eyebrow">{children}</p>
)

const openDirections = (listing: Listing) => {
  const destination =
    listing.mapLocation ||
    `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,
    "_blank",
    "noopener,noreferrer",
  )
}

function MikvahHero({
  onFind,
  onAdd,
}: {
  onFind: () => void
  onAdd: () => void
}) {
  return (
    <section className="mikvah-hero">
      <div className="container mikvah-hero__grid">
        <div className="mikvah-hero__copy">
          <Eyebrow>MIKVAH DIRECTORY</Eyebrow>
          <MikvahHeading level={1}>
            Find a Mikvah
            <br />
            Near You
          </MikvahHeading>
          <p className="mikvah-hero__description">
            Discover local Mikvahs, find contact information, explore visiting
            hours, and connect with trusted community locations.
          </p>
          <div className="mikvah-actions">
            <CommunityButton className="mikvah-button" onClick={onFind}>
              Find a Mikvah <MikvahIcon name="arrow" size={17} />
            </CommunityButton>
            <CommunityButton
              variant="secondary"
              className="mikvah-button--secondary"
              onClick={onAdd}
            >
              Add a Mikvah
            </CommunityButton>
          </div>
          <p className="mikvah-reassurance">
            <span>
              <MikvahIcon name="info" size={15} />
            </span>
            Community-submitted information, reviewed before publication.
          </p>
        </div>
        <figure className="mikvah-hero__visual">
          <div className="mikvah-hero__arch">
            <img
              src={mikvahHeroImage}
              alt="Stone arches reflected in a still, serene pool"
            />
          </div>
          <figcaption>
            <span>Thoughtfully gathered</span>
            <strong>Community information, beautifully organized.</strong>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

function MikvahSearchPanel({
  onSearch,
  onNear,
}: {
  onNear: (coordinates: [number, number]) => void
  onSearch: (query: string) => void
}) {
  const [query, setQuery] = useState("")
  const [locationStatus, setLocationStatus] = useState("")

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location services are not available in this browser.")
      return
    }
    setLocationStatus("Requesting your location…")
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocationStatus("Location found. Showing nearby Mikvahs.")
        onNear([position.coords.longitude, position.coords.latitude])
      },
      () =>
        setLocationStatus(
          "We could not access your location. Try searching by city or ZIP code.",
        ),
    )
  }

  return (
    <section className="mikvah-search-section" id="mikvah-search">
      <div className="container">
        <div className="mikvah-search-panel">
          <div>
            <Eyebrow>SEARCH THE CATSKILLS</Eyebrow>
            <MikvahHeading level={2}>
              Find the Right Mikvah for You
            </MikvahHeading>
            <p>Search by city, neighborhood, or ZIP code.</p>
          </div>
          <form
            className="mikvah-search-form"
            onSubmit={(event) => {
              event.preventDefault()
              onSearch(query.trim())
            }}
          >
            <label className="mikvah-search-input">
              <span className="sr-only">City, neighborhood, or ZIP code</span>
              <MikvahIcon name="pin" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Enter city, neighborhood, or ZIP code"
              />
            </label>
            <CommunityButton type="submit" className="mikvah-button">
              <MikvahIcon name="search" size={17} /> Search Mikvahs
            </CommunityButton>
            <CommunityButton
              variant="ghost"
              className="mikvah-location-button"
              onClick={useCurrentLocation}
            >
              <MikvahIcon name="locate" size={17} /> Use My Location
            </CommunityButton>
          </form>
          {locationStatus && (
            <p className="mikvah-location-status" role="status">
              {locationStatus}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function MikvahListingPreview({
  listings,
  navigate,
  onAdd,
}: {
  listings: Listing[]
  navigate: MikvahHomeProps["navigate"]
  onAdd: () => void
}) {
  const published = useMemo(
    () =>
      listings
        .filter(
          (listing) =>
            listing.type === "Mikvah" && listing.status === "Published",
        )
        .slice(0, 3),
    [listings],
  )

  return (
    <section className="mikvah-section mikvah-listings">
      <div className="container">
        <div className="mikvah-section-heading">
          <div>
            <Eyebrow>DISCOVER LOCAL LOCATIONS</Eyebrow>
            <MikvahHeading level={2}>
              Explore Our Mikvah Directory
            </MikvahHeading>
            <p>
              Browse community listings and find the information you need before
              visiting.
            </p>
          </div>
          {published.length > 0 && (
            <CommunityButton
              variant="secondary"
              className="mikvah-outline-button"
              onClick={() => navigate("mikvah-directory")}
            >
              View All Mikvahs <MikvahIcon name="arrow" size={16} />
            </CommunityButton>
          )}
        </div>
        {published.length === 0 ? (
          <div className="mikvah-empty">
            <span>
              <MikvahIcon name="water" size={29} />
            </span>
            <MikvahHeading level={3}>No Mikvahs Listed Yet</MikvahHeading>
            <p>
              Approved community listings will appear here after review. Know an
              authorized representative who can help?
            </p>
            <CommunityButton className="mikvah-button" onClick={onAdd}>
              Submit a Mikvah
            </CommunityButton>
          </div>
        ) : (
          <div className="mikvah-listing-grid">
            {published.map((listing) => {
              const hasContact = Boolean(
                listing.data.contactPhone || listing.data.appointmentPhone,
              )
              return (
                <article className="mikvah-listing-card" key={listing.id}>
                  <div className="mikvah-listing-card__information">
                    <div className="mikvah-listing-card__top">
                      <span className="mikvah-card-icon">
                        <MikvahIcon name="water" />
                      </span>
                      <span className="mikvah-contact-status">
                        <i />
                        {hasContact ? "Contact available" : "Details available"}
                      </span>
                    </div>
                    <MikvahHeading level={3}>{listing.name}</MikvahHeading>
                    <p className="mikvah-listing-card__city">
                      <MikvahIcon name="pin" size={16} />
                      {listing.city}, {listing.state}
                    </p>
                    {listing.address && (
                      <p className="mikvah-listing-card__address">
                        {listing.address}
                      </p>
                    )}
                    {listing.data.season && (
                      <dl className="mikvah-listing-card__season">
                        <div>
                          <dt>Operating season</dt>
                          <dd>{listing.data.season}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                  <dl className="mikvah-listing-card__appointment">
                    <div>
                      <dt>Appointment</dt>
                      <dd>
                        {!listing.data.appointmentRequired
                          ? "Not provided"
                          : listing.data.appointmentRequired === "Yes"
                            ? "Required"
                            : listing.data.appointmentRequired === "No"
                              ? "Not required"
                              : listing.data.appointmentRequired}
                      </dd>
                    </div>
                  </dl>
                  <div className="mikvah-listing-card__actions">
                    <CommunityButton
                      className="mikvah-card-button"
                      onClick={() => navigate("mikvah-detail", listing.id)}
                    >
                      View Details
                    </CommunityButton>
                    {(listing.address || listing.mapLocation) && (
                      <CommunityButton
                        variant="ghost"
                        className="mikvah-direction-button"
                        onClick={() => openDirections(listing)}
                      >
                        Get Directions
                      </CommunityButton>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

const features = [
  {
    icon: "pin" as const,
    title: "Locations & Directions",
    description: "Find location details and directions to community Mikvahs.",
  },
  {
    icon: "clock" as const,
    title: "Operating Hours",
    description:
      "Review available summer, winter, Erev Shabbos, and Motzei Shabbos information.",
  },
  {
    icon: "calendar" as const,
    title: "Appointments & Contacts",
    description:
      "See whether appointments are required and find approved contact details.",
  },
  {
    icon: "info" as const,
    title: "Helpful Instructions",
    description: "Read additional guidance shared by the facility.",
  },
]

function MikvahDetailsSection() {
  return (
    <section className="mikvah-section mikvah-details">
      <div className="container">
        <div className="mikvah-section-heading mikvah-section-heading--center">
          <div>
            <Eyebrow>THOUGHTFULLY ORGANIZED</Eyebrow>
            <MikvahHeading level={2}>
              All the Details, in One Place
            </MikvahHeading>
            <p>Helpful information to make planning your visit easier.</p>
          </div>
        </div>
        <div className="mikvah-feature-grid">
          {features.map((feature) => (
            <article className="mikvah-feature-card" key={feature.title}>
              <span>
                <MikvahIcon name={feature.icon} size={23} />
              </span>
              <MikvahHeading level={3}>{feature.title}</MikvahHeading>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function MikvahHowItWorks() {
  const steps = [
    ["Search", "Enter your area to discover listed Mikvahs nearby."],
    ["Explore", "Review location details, hours, and contact information."],
    ["Connect", "Contact the facility when needed and plan your visit."],
  ]
  return (
    <section className="mikvah-section mikvah-how">
      <div className="container">
        <div className="mikvah-section-heading">
          <div>
            <Eyebrow>A CALMER WAY TO PLAN</Eyebrow>
            <MikvahHeading level={2}>
              Finding a Mikvah, Made Simple
            </MikvahHeading>
          </div>
        </div>
        <ol className="mikvah-steps">
          {steps.map(([title, description], index) => (
            <li key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <MikvahHeading level={3}>{title}</MikvahHeading>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function MikvahCommunityCTA({
  onAdd,
  navigate,
}: {
  onAdd: () => void
  navigate: MikvahHomeProps["navigate"]
}) {
  return (
    <section className="mikvah-section mikvah-community">
      <div className="container">
        <div className="mikvah-community__panel">
          <div>
            <Eyebrow>HELP OUR COMMUNITY</Eyebrow>
            <MikvahHeading level={2}>
              Know a Mikvah That Should Be Listed?
            </MikvahHeading>
          </div>
          <div>
            <p>
              Help keep community information accurate and accessible.
              Authorized representatives can submit Mikvah details for review.
            </p>
            <div className="mikvah-actions">
              <CommunityButton className="mikvah-button" onClick={onAdd}>
                Add a Mikvah <MikvahIcon name="arrow" size={17} />
              </CommunityButton>
              <CommunityButton
                variant="ghost"
                className="mikvah-learn-button"
                onClick={() => navigate("signup", "mikvah")}
              >
                Learn About Submissions
              </CommunityButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MikvahTrust() {
  return (
    <section className="mikvah-trust">
      <div className="container mikvah-trust__inner">
        <span>
          <MikvahIcon name="info" size={24} />
        </span>
        <div>
          <MikvahHeading level={2}>
            Information You Can Navigate With Confidence
          </MikvahHeading>
          <p>
            Directory submissions are reviewed before publication. Hours,
            appointments, and visiting requirements may change, so please
            confirm important details with the Mikvah directly. Contact details
            are shown only when provided by an approved submission or a named
            public directory source.
          </p>
        </div>
      </div>
    </section>
  )
}

export default function MikvahHomePage({
  listings,
  isLoggedIn,
  navigate,
  onSearch,
  onNear,
}: MikvahHomeProps) {
  const addMikvah = () => {
    if (isLoggedIn) navigate("mikvah-form")
    else navigate("login", "mikvah")
  }
  const findMikvah = () =>
    document
      .getElementById("mikvah-search")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })

  return (
    <main className="mikvah-home">
      <MikvahHero onFind={findMikvah} onAdd={addMikvah} />
      <MikvahSearchPanel onSearch={onSearch} onNear={onNear} />
      <MikvahListingPreview
        listings={listings}
        navigate={navigate}
        onAdd={addMikvah}
      />
      <MikvahDetailsSection />
      <MikvahHowItWorks />
      <MikvahCommunityCTA onAdd={addMikvah} navigate={navigate} />
      <MikvahTrust />
    </main>
  )
}
