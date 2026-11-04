import { useEffect, useRef, useState } from "react"
import {
  CommunityButton,
  Icon,
  PortalLayout,
  StatusBadge,
  type CommunityPage,
  type Listing,
  type ListingStatus,
  type Navigate,
} from "./Community"
import MinyanScheduleEditor, {
  createMinyanSchedule,
  formatMinyanSchedule,
  validateMinyanSchedule,
  type MinyanSchedule,
} from "./MinyanSchedule"
import AddressAutocomplete from "./AddressAutocomplete"
import { createLocalId } from "./ids"

type LocationId = "primary" | string
type ListingUpdater = (current: Listing) => Listing

type ScheduleEditorState = {
  locationId: LocationId
  mode: "add" | "edit"
  schedule: MinyanSchedule
  original?: MinyanSchedule
  showErrors: boolean
  confirmDiscard: boolean
}

type LocationEditorState = {
  locationId?: string
  name: string
  type: string
  address: string
  error: string
}

type OverlayState = {
  type: "schedule"
  editor: ScheduleEditorState
} | {
  type: "location"
  editor: LocationEditorState
} | {
  type: "remove-schedule"
  locationId: LocationId
  scheduleId: string
} | {
  type: "remove-location"
  locationId: string
}

const locationTypes = [
  "Side room",
  "Beis Medrash",
  "Mesivta",
  "Talmud Torah",
  "Nearby building",
  "Other affiliated location",
]

const isSchedulePopulated = (schedule: MinyanSchedule) =>
  Boolean(
    schedule.prayerType ||
      schedule.customPrayerName ||
      schedule.scheduleType ||
      schedule.daysOfWeek.length ||
      schedule.shabbosPeriod ||
      schedule.occasion ||
      schedule.seasonalPattern ||
      schedule.startTime ||
      schedule.timeDescription ||
      schedule.notes,
  )

function locationLabel(listing: Listing, locationId: LocationId) {
  if (locationId === "primary") return "Main Shul Location"
  const location = listing.locations?.find((item) => item.id === locationId)
  return location?.name?.trim() || "Additional Minyan Location"
}

function scheduleLocation(listing: Listing, locationId: LocationId) {
  if (locationId === "primary") return listing.primarySchedules || []
  return (
    listing.locations?.find((location) => location.id === locationId)
      ?.schedules || []
  )
}

function updateScheduleCollection(
  listing: Listing,
  locationId: LocationId,
  schedules: MinyanSchedule[],
): Listing | null {
  if (locationId === "primary") {
    return { ...listing, primarySchedules: schedules }
  }
  if (!listing.locations?.some((location) => location.id === locationId))
    return null
  return {
    ...listing,
    locations: listing.locations.map((location) =>
      location.id === locationId ? { ...location, schedules } : location,
    ),
  }
}

function reviewMessage(status: ListingStatus) {
  if (status === "Draft")
    return "Changes are saved to your draft and are not visible in the public directory."
  if (status === "Pending Review")
    return "This submission is awaiting review. Wait for a decision before making further edits."
  if (status === "Published")
    return "Saving an edit submits a new version for review. Your approved version stays public until the update is approved."
  return "Saving an edit submits this listing for review before it appears in the public directory."
}

function ShulAddress({ listing }: { listing: Listing }) {
  const address = [
    listing.address,
    [listing.city, listing.state].filter(Boolean).join(", "),
    listing.zip,
  ]
    .filter(Boolean)
    .join(", ")
  return (
    <>
      {address && <p>{address}</p>}
      {listing.mapLocation && (
        <p className="shul-location-card__map">
          Map / GPS: {listing.mapLocation}
        </p>
      )}
    </>
  )
}

function ManagementDialog({
  busy = false,
  title,
  description,
  onRequestClose,
  children,
}: {
  busy?: boolean
  title: string
  description: string
  onRequestClose: () => void
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    const firstControl =
      dialog.querySelector<HTMLElement>(
        ".shul-management-dialog__body input:not([type='hidden']), .shul-management-dialog__body select, .shul-management-dialog__body textarea",
      ) || dialog.querySelector<HTMLElement>(".shul-management-dialog__close")
    firstControl?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="shul-management-dialog"
      aria-labelledby="shul-management-dialog-title"
      aria-describedby="shul-management-dialog-description"
      onCancel={(event) => {
        event.preventDefault()
        onRequestClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onRequestClose()
      }}
    >
      <div className="shul-management-dialog__head">
        <div>
          <h2 id="shul-management-dialog-title">{title}</h2>
          <p id="shul-management-dialog-description">{description}</p>
        </div>
        <button
          type="button"
          className="shul-management-dialog__close"
          disabled={busy}
          onClick={onRequestClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>
    </dialog>
  )
}

export default function ShulManagementPage({
  listing,
  navigate,
  onUpdate,
}: {
  listing?: Listing
  navigate: Navigate
  onUpdate: (update: ListingUpdater) => Promise<boolean>
}) {
  const savingRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [overlay, setOverlay] = useState<OverlayState | null>(null)
  const [successMessage, setSuccessMessage] = useState("")
  const [saveError, setSaveError] = useState("")
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!successMessage) return
    const timeout = window.setTimeout(() => setSuccessMessage(""), 4000)
    return () => window.clearTimeout(timeout)
  }, [successMessage])

  const closeOverlay = () => {
    if (savingRef.current) return
    setOverlay(null)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const recordTrigger = (element: HTMLElement) => {
    triggerRef.current = element
  }

  const persist = async (update: (current: Listing) => Listing | null) => {
    if (savingRef.current) return false
    savingRef.current = true; setSaving(true)
    setSaveError("")
    let changed = false
    let saved = false
    try { saved = await onUpdate((current) => {
      const updated = update(current)
      if (!updated || updated === current) return current
      changed = true
      const now = new Date().toISOString()
      const shouldResubmit =
        current.status !== "Draft" && current.status !== "Pending Review"
      return {
        ...updated,
        status: shouldResubmit ? "Pending Review" : current.status,
        submittedAt: shouldResubmit ? now : current.submittedAt,
        updatedAt: now,
      }
    })

    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save. Please retry.")
      return false
    } finally { savingRef.current = false; setSaving(false) }
    if (!saved || !changed) {
      setSaveError(
        changed
          ? "We could not save this change on the server. Your edits are still open; please try again."
          : "This Shul or location changed before the edit could be saved. Close this window and refresh the page.",
      )
      return false
    }

    setSaveError("")
    setSuccessMessage("Your changes have been saved.")
    return true
  }

  const beginScheduleEdit = (
    event: React.MouseEvent<HTMLElement>,
    locationId: LocationId,
    mode: "add" | "edit",
    schedule?: MinyanSchedule,
  ) => {
    recordTrigger(event.currentTarget)
    const initial = schedule ? { ...schedule } : createMinyanSchedule()
    setOverlay({
      type: "schedule",
      editor: {
        locationId,
        mode,
        schedule: initial,
        original: schedule ? { ...schedule } : undefined,
        showErrors: false,
        confirmDiscard: false,
      },
    })
  }

  const requestScheduleClose = (editor: ScheduleEditorState) => {
    const changed =
      editor.mode === "add"
        ? isSchedulePopulated(editor.schedule)
        : JSON.stringify(editor.schedule) !== JSON.stringify(editor.original)
    if (changed) {
      setOverlay({
        type: "schedule",
        editor: { ...editor, confirmDiscard: true },
      })
    } else closeOverlay()
  }

  const saveSchedule = async (editor: ScheduleEditorState) => {
    if (Object.keys(validateMinyanSchedule(editor.schedule)).length > 0) {
      setOverlay({
        type: "schedule",
        editor: { ...editor, showErrors: true, confirmDiscard: false },
      })
      return
    }

    const saved = await persist((current) => {
      const schedules = scheduleLocation(current, editor.locationId)
      if (
        editor.mode === "edit" &&
        !schedules.some((schedule) => schedule.id === editor.schedule.id)
      )
        return null
      const nextSchedules =
        editor.mode === "add"
          ? [...schedules, editor.schedule]
          : schedules.map((schedule) =>
              schedule.id === editor.schedule.id ? editor.schedule : schedule,
            )
      return updateScheduleCollection(current, editor.locationId, nextSchedules)
    })
    if (saved) closeOverlay()
  }

  const beginLocationEdit = (
    event: React.MouseEvent<HTMLElement>,
    locationId?: string,
  ) => {
    recordTrigger(event.currentTarget)
    const location = locationId
      ? listing?.locations?.find((item) => item.id === locationId)
      : undefined
    setOverlay({
      type: "location",
      editor: {
        locationId,
        name: location?.name || "",
        type: location?.type || "Beis Medrash",
        address: location?.address || "",
        error: "",
      },
    })
  }

  const saveLocation = async (editor: LocationEditorState) => {
    if (!editor.name.trim()) {
      setOverlay({
        type: "location",
        editor: { ...editor, error: "Enter a name for this Minyan location." },
      })
      return
    }

    const saved = await persist((current) => {
      if (!editor.locationId) {
        const location = {
          id: createLocalId("location"),
          name: editor.name.trim(),
          type: editor.type,
          address: editor.address.trim(),
          schedules: [],
        }
        return {
          ...current,
          locations: [...(current.locations || []), location],
        }
      }
      if (!current.locations?.some((item) => item.id === editor.locationId))
        return null
      return {
        ...current,
        locations: current.locations.map((location) =>
          location.id === editor.locationId
            ? {
                ...location,
                name: editor.name.trim(),
                type: editor.type,
                address: editor.address.trim(),
              }
            : location,
        ),
      }
    })
    if (saved) closeOverlay()
  }

  const confirmRemoval = async () => {
    if (!overlay || overlay.type === "schedule" || overlay.type === "location")
      return
    const currentOverlay = overlay
    const saved = await persist((current) => {
      if (currentOverlay.type === "remove-schedule") {
        const schedules = scheduleLocation(current, currentOverlay.locationId)
        if (!schedules.some((item) => item.id === currentOverlay.scheduleId))
          return null
        return updateScheduleCollection(
          current,
          currentOverlay.locationId,
          schedules.filter((item) => item.id !== currentOverlay.scheduleId),
        )
      }
      if (
        !current.locations?.some(
          (item) => item.id === currentOverlay.locationId,
        )
      )
        return null
      return {
        ...current,
        locations: current.locations.filter(
          (location) => location.id !== currentOverlay.locationId,
        ),
      }
    })
    if (!saved) return

    if (currentOverlay.type === "remove-schedule") {
      triggerRef.current = document.getElementById(
        `${currentOverlay.locationId}-add-schedule`,
      )
    } else {
      triggerRef.current = document.getElementById("shul-add-location")
    }
    closeOverlay()
  }

  if (!listing || listing.type !== "Shul") {
    return (
      <main className="portal-page">
        <div
          className="portal-container shul-management__unavailable"
          role="alert"
        >
          <h1>Shul unavailable</h1>
          <p>
            This Shul could not be found or you do not have permission to manage
            it.
          </p>
          <CommunityButton onClick={() => navigate("dashboard")}>
            Back to My Listings
          </CommunityButton>
        </div>
      </main>
    )
  }

  const primaryLocationId = "primary"
  const primarySchedules = listing.primarySchedules || []
  const overviewFields = [
    ["Gabbai", listing.data.gabbaiName],
    ["Gabbai telephone", listing.data.gabbaiPhone],
  ].filter(([, value]) => Boolean(value))

  const renderScheduleList = (
    locationId: LocationId,
    schedules: MinyanSchedule[],
  ) =>
    schedules.length ? (
      <ul className="shul-schedule-list">
        {schedules.map((schedule) => (
          <li className="shul-schedule-row" key={schedule.id}>
            <div className="shul-schedule-row__summary">
              <strong>
                {schedule.prayerType === "Other"
                  ? schedule.customPrayerName || "Other service"
                  : schedule.prayerType || "Unspecified prayer"}
              </strong>
              <span>
                {formatMinyanSchedule(schedule)
                  .split(" · ")
                  .slice(1)
                  .join(" · ")}
              </span>
              {schedule.notes && <small>{schedule.notes}</small>}
            </div>
            <button
              type="button"
              className="shul-schedule-row__edit"
              onClick={(event) =>
                beginScheduleEdit(event, locationId, "edit", schedule)
              }
            >
              Edit
            </button>
            <details className="shul-schedule-menu">
              <summary
                aria-label={`More actions for ${formatMinyanSchedule(schedule)}`}
              >
                <span aria-hidden="true">•••</span>
              </summary>
              <button
                type="button"
                className="shul-schedule-menu__remove"
                onClick={(event) => {
                  recordTrigger(event.currentTarget)
                  setOverlay({
                    type: "remove-schedule",
                    locationId,
                    scheduleId: schedule.id,
                  })
                }}
              >
                Remove Minyan
              </button>
            </details>
          </li>
        ))}
      </ul>
    ) : (
      <div className="shul-schedule-empty">
        <strong>No Minyan times added yet.</strong>
        <p>
          Add a prayer schedule so community members know when services take
          place.
        </p>
      </div>
    )

  const addScheduleButton = (locationId: LocationId) => (
    <CommunityButton
      variant="secondary"
      className="shul-location-card__add-schedule"
      onClick={(event) =>
        beginScheduleEdit(
          event as React.MouseEvent<HTMLElement>,
          locationId,
          "add",
        )
      }
    >
      <Icon name="plus" /> Add Minyan Time
    </CommunityButton>
  )

  const renderOverlay = () => {
    if (!overlay) return null
    if (overlay.type === "schedule") {
      const editor = overlay.editor
      const label = locationLabel(listing, editor.locationId)
      return (
        <ManagementDialog
          busy={saving}
          key={`schedule-${editor.mode}-${editor.schedule.id}`}
          title={
            editor.mode === "edit" ? "Edit Minyan Time" : "Add Minyan Time"
          }
          description={label}
          onRequestClose={() => requestScheduleClose(editor)}
        >
          <form
            className="shul-management-dialog__body"
            aria-busy={saving}
            onSubmit={(event) => {
              event.preventDefault()
              saveSchedule(editor)
            }}
          >
            {saveError && (
              <p className="form-alert" role="alert">
                {saveError}
              </p>
            )}
            <MinyanScheduleEditor
              locationId={`management-${editor.locationId}-${editor.schedule.id}`}
              locationLabel={label}
              schedules={[editor.schedule]}
              showErrors={editor.showErrors}
              onAdd={() => undefined}
              onChange={(_, changes) =>
                setOverlay({
                  type: "schedule",
                  editor: {
                    ...editor,
                    schedule: { ...editor.schedule, ...changes },
                    confirmDiscard: false,
                  },
                })
              }
              onRemove={() => undefined}
              hideIntro
              hideAddButton
              hideRemoveAction
            />
            {editor.confirmDiscard && (
              <div className="shul-management-dialog__discard" role="status">
                <p>Discard your unsaved Minyan changes?</p>
                <button type="button" onClick={() => closeOverlay()}>
                  Discard changes
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setOverlay({
                      type: "schedule",
                      editor: { ...editor, confirmDiscard: false },
                    })
                  }
                >
                  Keep editing
                </button>
              </div>
            )}
            <div className="shul-management-dialog__actions">
              <CommunityButton
                variant="secondary"
                onClick={() => requestScheduleClose(editor)}
              >
                Cancel
              </CommunityButton>
              <CommunityButton type="submit">
                {editor.mode === "edit" ? "Save Changes" : "Add Minyan Time"}
              </CommunityButton>
            </div>
          </form>
        </ManagementDialog>
      )
    }

    if (overlay.type === "location") {
      const editor = overlay.editor
      return (
        <ManagementDialog
          busy={saving}
          key={`location-${editor.locationId || "new"}`}
          title={
            editor.locationId ? "Edit Minyan Location" : "Add Minyan Location"
          }
          description="Keep this prayer space's name and directions accurate. Its schedules remain attached to it."
          onRequestClose={closeOverlay}
        >
          <form
            className="shul-management-dialog__body"
            aria-busy={saving}
            onSubmit={(event) => {
              event.preventDefault()
              saveLocation(editor)
            }}
          >
            {saveError && (
              <p className="form-alert" role="alert">
                {saveError}
              </p>
            )}
            <label className="form-field" htmlFor="managed-location-name">
              <span>
                Location Name <b aria-hidden="true">*</b>
              </span>
              <input
                id="managed-location-name"
                value={editor.name}
                onChange={(event) =>
                  setOverlay({
                    type: "location",
                    editor: { ...editor, name: event.target.value, error: "" },
                  })
                }
                aria-invalid={Boolean(editor.error)}
                aria-describedby={
                  editor.error ? "managed-location-error" : undefined
                }
              />
              {editor.error && (
                <small className="field-error" id="managed-location-error">
                  {editor.error}
                </small>
              )}
            </label>
            <label className="form-field" htmlFor="managed-location-type">
              <span>Location Type</span>
              <select
                id="managed-location-type"
                value={editor.type}
                onChange={(event) =>
                  setOverlay({
                    type: "location",
                    editor: { ...editor, type: event.target.value },
                  })
                }
              >
                {locationTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <AddressAutocomplete label="Address / GPS" required={false} value={editor.address}
              onChange={address => setOverlay({ type: "location", editor: { ...editor, address } })}
              onSelect={item => setOverlay({ type: "location", editor: { ...editor, address: item.formatted } })} />
            <div className="shul-management-dialog__actions">
              <CommunityButton variant="secondary" onClick={closeOverlay}>
                Cancel
              </CommunityButton>
              <CommunityButton type="submit">
                {editor.locationId ? "Save Location" : "Add Location"}
              </CommunityButton>
            </div>
          </form>
        </ManagementDialog>
      )
    }

    if (overlay.type === "remove-schedule") {
      const schedule = scheduleLocation(listing, overlay.locationId).find(
        (item) => item.id === overlay.scheduleId,
      )
      return (
        <ManagementDialog
          busy={saving}
          key={`remove-schedule-${overlay.scheduleId}`}
          title="Remove this Minyan time?"
          description={
            schedule ? formatMinyanSchedule(schedule) : "Selected Minyan time"
          }
          onRequestClose={closeOverlay}
        >
          <div className="shul-management-dialog__body">
            {saveError && (
              <p className="form-alert" role="alert">
                {saveError}
              </p>
            )}
            <p>
              This schedule will be removed from{" "}
              {locationLabel(listing, overlay.locationId)}. Other Minyan times
              and the Shul listing will not be affected.
            </p>
            {listing.status === "Published" && (
              <p className="shul-management-dialog__warning">
                Removing a schedule returns the listing to Pending Review until
                the change is approved.
              </p>
            )}
            <div className="shul-management-dialog__actions">
              <CommunityButton variant="secondary" onClick={closeOverlay}>
                Cancel
              </CommunityButton>
              <CommunityButton variant="danger" onClick={confirmRemoval}>
                Remove Minyan
              </CommunityButton>
            </div>
          </div>
        </ManagementDialog>
      )
    }

    const location = listing.locations?.find(
      (item) => item.id === overlay.locationId,
    )
    const scheduleCount = location?.schedules?.length || 0
    return (
      <ManagementDialog
        busy={saving}
        key={`remove-location-${overlay.locationId}`}
        title="Remove this location?"
        description={location?.name || "Additional Minyan location"}
        onRequestClose={closeOverlay}
      >
        <div className="shul-management-dialog__body">
          {saveError && (
            <p className="form-alert" role="alert">
              {saveError}
            </p>
          )}
          <p>
            This location and its {scheduleCount} associated Minyan{" "}
            {scheduleCount === 1 ? "schedule" : "schedules"} will be removed.
            The main Shul and its other locations will not be affected.
          </p>
          {listing.status === "Published" && (
            <p className="shul-management-dialog__warning">
              Removing a location returns the listing to Pending Review until
              the change is approved.
            </p>
          )}
          <div className="shul-management-dialog__actions">
            <CommunityButton variant="secondary" onClick={closeOverlay}>
              Cancel
            </CommunityButton>
            <CommunityButton variant="danger" onClick={confirmRemoval}>
              Remove Location
            </CommunityButton>
          </div>
        </div>
      </ManagementDialog>
    )
  }

  return (
    <PortalLayout navigate={navigate} active="listings">
      <div className="shul-management">
        <button
          type="button"
          className="shul-management__back"
          onClick={() => navigate("dashboard")}
        >
          <Icon name="chevron" /> My Listings
        </button>
        {saving && <p role="status">Saving changes to the server…</p>}
        <header className="shul-management__header">
          <div>
            <p className="eyebrow">SHUL MANAGEMENT</p>
            <h1>{listing.name || "Untitled Shul"}</h1>
            <p className="shul-management__header-address">
              {[listing.city, listing.state].filter(Boolean).join(", ") ||
                "Location not provided"}
            </p>
          </div>
          <div className="shul-management__header-actions">
            <StatusBadge status={listing.status} />
            <CommunityButton
              variant="secondary"
              onClick={() => navigate("shul-form", listing.id)}
            >
              Edit Shul Details
            </CommunityButton>
          </div>
        </header>

        {saveError && !overlay && (
          <p className="form-alert" role="alert">
            {saveError}
          </p>
        )}
        {successMessage && (
          <p className="shul-management__success" role="status">
            {successMessage}
          </p>
        )}
        <p className="shul-management__review-note">
          <Icon name="alert" /> {reviewMessage(listing.status)}
        </p>

        <section
          className="shul-management__overview"
          aria-labelledby="shul-overview-heading"
        >
          <div className="shul-management__section-heading">
            <div>
              <p className="eyebrow">LISTING DETAILS</p>
              <h2 id="shul-overview-heading">Shul Overview</h2>
            </div>
          </div>
          <div className="shul-overview-card">
            <div className="shul-overview-card__address">
              <Icon name="map" />
              <div>
                <strong>Main Shul Location</strong>
                <ShulAddress listing={listing} />
              </div>
            </div>
            {overviewFields.length > 0 && (
              <dl className="shul-overview-card__contacts">
                {overviewFields.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        <section
          className="shul-management__locations"
          aria-labelledby="shul-locations-heading"
        >
          <div className="shul-management__section-heading">
            <div>
              <p className="eyebrow">PRAYER SPACES</p>
              <h2 id="shul-locations-heading">
                Minyan Locations &amp; Schedules
              </h2>
              <p>
                Manage prayer locations and Minyan times associated with this
                Shul.
              </p>
            </div>
            <CommunityButton
              id="shul-add-location"
              variant="secondary"
              onClick={(event) =>
                beginLocationEdit(event as React.MouseEvent<HTMLElement>)
              }
            >
              <Icon name="plus" /> Add Location
            </CommunityButton>
          </div>

          <div className="shul-location-list">
            <article className="shul-location-card">
              <div className="shul-location-card__heading">
                <div>
                  <span className="shul-location-card__eyebrow">
                    PRIMARY LOCATION
                  </span>
                  <h3>Main Shul Location</h3>
                  <ShulAddress listing={listing} />
                </div>
                <span className="shul-location-card__count">
                  {primarySchedules.length}{" "}
                  {primarySchedules.length === 1 ? "schedule" : "schedules"}
                </span>
              </div>
              <div className="shul-location-card__schedules">
                <h4>Minyan Schedules</h4>
                {renderScheduleList(primaryLocationId, primarySchedules)}
                {addScheduleButton(primaryLocationId)}
              </div>
            </article>

            {(listing.locations || []).map((location) => (
              <article className="shul-location-card" key={location.id}>
                <div className="shul-location-card__heading">
                  <div>
                    <span className="shul-location-card__eyebrow">
                      ADDITIONAL LOCATION
                    </span>
                    <h3>{location.name || "Additional Minyan Location"}</h3>
                    {location.type && (
                      <span className="shul-location-card__type">
                        {location.type}
                      </span>
                    )}
                    {location.address && <p>{location.address}</p>}
                  </div>
                  <div className="shul-location-card__heading-actions">
                    <span className="shul-location-card__count">
                      {location.schedules?.length || 0}{" "}
                      {(location.schedules?.length || 0) === 1
                        ? "schedule"
                        : "schedules"}
                    </span>
                    <details className="shul-schedule-menu shul-location-menu">
                      <summary
                        aria-label={`More actions for ${location.name || "additional location"}`}
                      >
                        <span aria-hidden="true">•••</span>
                      </summary>
                      <button
                        type="button"
                        className="shul-schedule-menu__remove"
                        onClick={(event) => {
                          recordTrigger(event.currentTarget)
                          setOverlay({
                            type: "remove-location",
                            locationId: location.id,
                          })
                        }}
                      >
                        Remove Location
                      </button>
                    </details>
                    <button
                      type="button"
                      className="shul-location-card__edit"
                      onClick={(event) => beginLocationEdit(event, location.id)}
                    >
                      Edit Location
                    </button>
                  </div>
                </div>
                <div className="shul-location-card__schedules">
                  <h4>Minyan Schedules</h4>
                  {renderScheduleList(location.id, location.schedules || [])}
                  {addScheduleButton(location.id)}
                </div>
              </article>
            ))}
          </div>
        </section>
        {renderOverlay()}
      </div>
    </PortalLayout>
  )
}
