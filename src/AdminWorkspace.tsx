import { useEffect, useState } from "react"
import {
  CommunityButton,
  StatusBadge,
  type Listing,
  type Navigate,
} from "./Community"
import { backendError, rpc, type ReviewEvent } from "./lib/backend"
import { formatMinyanSchedule } from "./MinyanSchedule"
import ReviewCoverPhoto from "./ReviewCoverPhoto"
import "./admin.css"

const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : "Not submitted"
function Details({ item, onPhotoReady }: { item: Listing; onPhotoReady?: (ready: boolean) => void }) {
  return (
    <>
      <h3>Cover photo</h3>
      <ReviewCoverPhoto key={item.coverPhotoPath || "no-photo"} path={item.coverPhotoPath} name={item.name} onReady={onPhotoReady} />
      <dl className="admin-fields">
        {Object.entries({
          Name: item.name,
          Address: [item.address, item.city, item.state, item.zip]
            .filter(Boolean)
            .join(", "),
          "Map location": item.mapLocation,
          ...item.data,
        })
          .filter(
            ([key, value]) =>
              value && !["permission", "confirmed"].includes(key),
          )
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {item.type === "Shul" && (
        <>
          <h3>Main location schedules</h3>
          {item.primarySchedules?.length ? (
            item.primarySchedules.map((s) => (
              <p key={s.id}>
                {formatMinyanSchedule(s)}
                {s.notes && ` · ${s.notes}`}
              </p>
            ))
          ) : (
            <p>No main-location schedules supplied.</p>
          )}
          {item.locations?.map((loc) => (
            <section className="admin-location" key={loc.id}>
              <h3>{loc.name}</h3>
              <p>
                {loc.type} · {loc.address}
              </p>
              {loc.schedules?.map((s) => (
                <p key={s.id}>
                  {formatMinyanSchedule(s)}
                  {s.notes && ` · ${s.notes}`}
                </p>
              ))}
            </section>
          ))}
        </>
      )}
    </>
  )
}

export default function AdminWorkspace({
  listings,
  selectedId,
  navigate,
  onRefresh,
}: {
  listings: Listing[]
  selectedId?: string
  navigate: Navigate
  onRefresh: () => Promise<void>
}) {
  const [tab, setTab] = useState("queue")
  const [query, setQuery] = useState("")
  const [type, setType] = useState("All types")
  const [status, setStatus] = useState("All statuses")
  const [feedback, setFeedback] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [history, setHistory] = useState<ReviewEvent[]>([])
  const [historyError, setHistoryError] = useState("")
  const [photoReady, setPhotoReady] = useState(false)
  const [photoReviewed, setPhotoReviewed] = useState(false)
  const item = listings.find((l) => l.id === selectedId)
  const needsPhotoReview = Boolean(item?.coverPhotoPath || item?.publishedVersion?.coverPhotoPath)
  const photoReviewKey = `${item?.versionId || ""}:${item?.coverPhotoPath || ""}`
  useEffect(() => { setPhotoReady(false); setPhotoReviewed(false) }, [photoReviewKey])
  useEffect(() => {
    setFeedback("")
    setNote("")
    setError("")
    setNotice("")
    setHistory([])
    setHistoryError("")
  }, [selectedId])
  useEffect(() => {
    let active = true
    if (selectedId)
      rpc<ReviewEvent[]>("listing_history", { p_listing_id: selectedId })
        .then((events) => {
          if (active) setHistory(events)
        })
        .catch((e) => {
          if (active) setHistoryError(backendError(e))
        })
    return () => {
      active = false
    }
  }, [selectedId, listings])
  const pending = listings.filter((l) => (l.reviewStatus === "pending_review" || l.status === "Pending Review"))
  const visible = listings
    .filter(
      (l) =>
        (tab !== "queue" || (l.reviewStatus === "pending_review" || l.status === "Pending Review")) &&
        (type === "All types" || l.type === type) &&
        (status === "All statuses" || l.status === status) &&
        `${l.name} ${l.city} ${l.ownerName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      (a.submittedAt || a.createdAt).localeCompare(
        b.submittedAt || b.createdAt,
      ),
    )
  const duplicates = item
    ? listings.filter(
        (l) =>
          l.id !== item.id &&
          l.type === item.type &&
          ((l.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
            item.name.trim()) ||
            (l.address.trim().toLowerCase() ===
              item.address.trim().toLowerCase() &&
              l.city.trim().toLowerCase() === item.city.trim().toLowerCase() &&
              item.address.trim())),
      )
    : []
  async function decide(decision: string) {
    if (!item?.versionId || busy) return
    if (decision !== "approved" && !feedback.trim())
      return setError(
        "Explain the decision to the contributor before continuing.",
      )
    if (decision === "approved" && needsPhotoReview && (!photoReviewed || Boolean(item.coverPhotoPath) && !photoReady)) {
      return setError("View and confirm the cover photo change before approving.")
    }
    setBusy(true)
    setError("")
    try {
      await rpc("review_listing", {
        p_version_id: item.versionId,
        p_decision: decision,
        p_feedback: feedback,
        p_internal_note: note,
      })
      await onRefresh()
      setNotice(
        "Decision saved. The notification is queued; email delivery requires the notification worker to be configured.",
      )
    } catch (e) {
      setError(backendError(e))
    } finally {
      setBusy(false)
    }
  }
  async function archive(listing: Listing) {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await rpc("set_listing_archived", {
        p_listing_id: listing.id,
        p_archived: listing.visibility !== "archived",
      })
      await onRefresh()
    } catch (e) {
      setError(backendError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="admin-workspace">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">CATSKILLS ERUV · ADMINISTRATION</p>
          <h1>{selectedId ? "Submission review" : "Directory oversight"}</h1>
          <p>
            Keep community information accurate, current, and carefully
            reviewed.
          </p>
        </div>
        <CommunityButton
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setError("")
            try {
              await onRefresh()
            } catch (e) {
              setError(backendError(e))
            }
          }}
        >
          Refresh data
        </CommunityButton>
      </header>
      <div className="admin-metrics">
        {[
          ["Awaiting review", pending.length],
          [
            "Mikvah submissions",
            pending.filter((l) => l.type === "Mikvah").length,
          ],
          ["Shul submissions", pending.filter((l) => l.type === "Shul").length],
          [
            "Public listings",
            listings.filter((l) => l.visibility === "published").length,
          ],
        ].map(([label, count]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </article>
        ))}
      </div>
      {error && (
        <p className="form-alert" role="alert">
          {error}{" "}
          <button
            onClick={async () => {
              try {
                await onRefresh()
                setError("")
              } catch (e) {
                setError(backendError(e))
              }
            }}
          >
            Reload latest data
          </button>
        </p>
      )}
      {notice && (
        <p className="save-note" role="status">
          {notice}
        </p>
      )}
      {selectedId ? (
        !item ? (
          <section className="admin-panel">
            <h2>Submission unavailable</h2>
            <p>It may have changed. Refresh the data or return to the queue.</p>
            <CommunityButton onClick={() => navigate("admin")}>
              Back to queue
            </CommunityButton>
          </section>
        ) : (
          <>
            <button className="back-auth" onClick={() => navigate("admin")}>
              ← Back to directory oversight
            </button>
            <div className="admin-review-layout">
              <div>
                <section className="admin-panel">
                  <div className="admin-panel-title">
                    <div>
                      <p className="eyebrow">
                        {item.type} · VERSION {item.versionNumber}
                      </p>
                      <h2>{item.name || "Untitled listing"}</h2>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <p>
                    Contributor: {item.ownerName} · Submitted{" "}
                    {date(item.submittedAt)}
                  </p>
                  {item.visibility === "published" &&
                    item.status !== "Published" && (
                      <p className="save-note">
                        The approved version remains public while this update is
                        reviewed.
                      </p>
                    )}
                  {(item.contributorEmail || item.contributorPhone) && <p>Account contact (admin only): {[item.contributorEmail, item.contributorPhone].filter(Boolean).join(" · ")}</p>}
              <h3>Possible duplicates</h3>
                  {duplicates.length ? (
                    duplicates.map((l) => (
                      <p key={l.id}>
                        <button
                          className="inline-link"
                          onClick={() => navigate("admin-review", l.id)}
                        >
                          {l.name}
                        </button>{" "}
                        · {l.address}, {l.city}
                      </p>
                    ))
                  ) : (
                    <p>
                      No exact name or address matches in the loaded records.
                      Check spelling and nearby locations manually.
                    </p>
                  )}
                </section>
                <section className="admin-panel">
                  <h2>
                    {item.publishedVersion &&
                    item.publishedVersion.versionId !== item.versionId
                      ? "Compare versions"
                      : "Submitted information"}
                  </h2>
                  <div
                    className={
                      item.publishedVersion &&
                      item.publishedVersion.versionId !== item.versionId
                        ? "admin-comparison"
                        : ""
                    }
                  >
                    {item.publishedVersion &&
                      item.publishedVersion.versionId !== item.versionId && (
                        <section>
                          <h3>Currently approved</h3>
                          <Details item={item.publishedVersion} />
                        </section>
                      )}
                    <section>
                      <h3>Version {item.versionNumber}</h3>
                      <Details key={item.versionId} item={item} onPhotoReady={setPhotoReady} />
                    </section>
                  </div>
                </section>
                <section className="admin-panel">
                  <h2>Activity & review history</h2>
                  {historyError ? (
                    <p role="alert">{historyError}</p>
                  ) : history.length ? (
                    history.map((event) => (
                      <article className="admin-event" key={event.id}>
                        <strong>{event.action.replace(/_/g, " ")}</strong>
                        <small>
                          {date(event.createdAt)} · {event.actor}
                        </small>
                        {event.feedback && (
                          <p>Contributor feedback: {event.feedback}</p>
                        )}
                        {event.internalNote && (
                          <p className="admin-private">
                            Internal note: {event.internalNote}
                          </p>
                        )}
                      </article>
                    ))
                  ) : (
                    <p>No recorded events yet.</p>
                  )}
                </section>
              </div>
              <aside className="admin-panel admin-decision">
                <h2>Review decision</h2>
                {(item.reviewStatus === "pending_review" || item.status === "Pending Review") ? (
                  <fieldset disabled={busy}>
                    <label>
                      Feedback to contributor
                      <textarea
                        rows={5}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Required when requesting changes or rejecting."
                      />
                    </label>
                    <label>
                      Internal admin note
                      <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Visible to administrators only."
                      />
                    </label>
                    {needsPhotoReview && <label className="admin-photo-confirmation">
                      <input type="checkbox" checked={photoReviewed} disabled={Boolean(item.coverPhotoPath) && !photoReady} onChange={event => setPhotoReviewed(event.target.checked)} />
                      {item.coverPhotoPath ? "I reviewed this version’s photo and its suitability for publication." : "I reviewed the removal of the currently published photo."}
                    </label>}
                    <CommunityButton disabled={needsPhotoReview && (!photoReviewed || Boolean(item.coverPhotoPath) && !photoReady)} onClick={() => decide("approved")}>
                      {item.visibility === "archived" ? "Approve version (keep archived)" : "Approve & publish"}
                    </CommunityButton>
                    <CommunityButton
                      variant="secondary"
                      onClick={() => decide("changes_requested")}
                    >
                      Request changes
                    </CommunityButton>
                    <CommunityButton
                      variant="danger"
                      onClick={() => decide("rejected")}
                    >
                      Reject submission
                    </CommunityButton>
                  </fieldset>
                ) : (
                  <p>
                    This version is {item.status.toLowerCase()}. Only pending
                    submissions can receive a review decision.
                  </p>
                )}
                <hr />
                <CommunityButton
                  variant="secondary"
                  disabled={
                    busy ||
                    (!item.publishedVersion && item.visibility === "archived")
                  }
                  onClick={() => archive(item)}
                >
                  {item.visibility === "archived"
                    ? "Restore approved listing"
                    : "Archive listing"}
                </CommunityButton>
                <p>
                  <small>
                    Archiving hides the listing and preserves its history.
                  </small>
                </p>
              </aside>
            </div>
          </>
        )
      ) : (
        <section className="admin-panel">
          <nav className="admin-tabs" aria-label="Admin sections">
            <button
              aria-pressed={tab === "queue"}
              onClick={() => {
                setTab("queue")
                setStatus("All statuses")
              }}
            >
              Review queue <span>{pending.length}</span>
            </button>
            <button aria-pressed={tab === "all"} onClick={() => setTab("all")}>
              All listings
            </button>
          </nav>
          <div className="admin-filters">
            <label>
              Search
              <input
                placeholder="Listing, town, or contributor"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              Listing type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {["All types", "Mikvah", "Shul"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {tab === "all" && (
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {[
                    "All statuses",
                    "Draft",
                    "Pending Review",
                    "Published",
                    "Changes Requested",
                    "Rejected",
                    "Archived",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            <span>{visible.length} results · Oldest submissions first</span>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Type</th>
                  <th>Contributor</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.name || "Untitled listing"}</strong>
                      <small>
                        {l.city}, {l.state}
                      </small>
                    </td>
                    <td>{l.type}</td>
                    <td>{l.ownerName}</td>
                    <td>{date(l.submittedAt)}</td>
                    <td>
                      <StatusBadge status={l.status} />
                      {l.visibility === "published" &&
                        l.status !== "Published" && (
                          <small>Approved version is public</small>
                        )}
                    </td>
                    <td>
                      <button
                        className="inline-link"
                        onClick={() => navigate("admin-review", l.id)}
                      >
                        {(l.reviewStatus === "pending_review" || l.status === "Pending Review")
                          ? "Review →"
                          : "View details →"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <div className="admin-empty">
              <h2>
                {query || type !== "All types" || status !== "All statuses"
                  ? "No matching listings"
                  : tab === "queue"
                    ? "You’re all caught up"
                    : "No listings yet"}
              </h2>
              <p>
                {tab === "queue"
                  ? "New contributor submissions will appear here for review."
                  : "Try a different filter or wait for the first submission."}
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
