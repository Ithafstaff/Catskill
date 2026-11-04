import { createLocalId } from "./ids"

export type PrayerType = "" | "Shacharis" | "Mincha" | "Maariv" | "Kabbalas Shabbos" | "Musaf" | "Selichos" | "Other"

export type ScheduleType = "" | "weekly" | "shabbos" | "yom-tov" | "seasonal"
export type TimeType = "fixed" | "variable"

export interface MinyanSchedule {
  id: string
  prayerType: PrayerType
  customPrayerName: string
  scheduleType: ScheduleType
  daysOfWeek: number[]
  shabbosPeriod: string
  occasion: string
  seasonalPattern: string
  timeType: TimeType
  startTime: string
  timeDescription: string
  notes: string
}

export type ScheduleErrors = Partial<Record<"prayerType" | "customPrayerName" | "scheduleType" | "daysOfWeek" | "shabbosPeriod" | "occasion" | "seasonalPattern" | "startTime" | "timeDescription", string>>

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]
const prayerTypes: PrayerType[] = [
  "Shacharis",
  "Mincha",
  "Maariv",
  "Kabbalas Shabbos",
  "Musaf",
  "Selichos",
  "Other",
]

export function createMinyanSchedule(): MinyanSchedule {
  return {
    id: createLocalId("schedule"),
    prayerType: "",
    customPrayerName: "",
    scheduleType: "",
    daysOfWeek: [],
    shabbosPeriod: "",
    occasion: "",
    seasonalPattern: "",
    timeType: "fixed",
    startTime: "",
    timeDescription: "",
    notes: "",
  }
}

export function validateMinyanSchedule(
  schedule: MinyanSchedule,
): ScheduleErrors {
  const errors: ScheduleErrors = {}
  if (!schedule.prayerType) errors.prayerType = "Please select a prayer type."
  if (schedule.prayerType === "Other" && !schedule.customPrayerName?.trim()) {
    errors.customPrayerName = "Please name this prayer or service."
  }
  if (!schedule.scheduleType)
    errors.scheduleType = "Please select a schedule type."
  if (schedule.scheduleType === "weekly" && !schedule.daysOfWeek?.length) {
    errors.daysOfWeek = "Please select at least one day."
  }
  if (schedule.scheduleType === "shabbos" && !schedule.shabbosPeriod) {
    errors.shabbosPeriod = "Please select when the service takes place."
  }
  if (schedule.scheduleType === "yom-tov" && !schedule.occasion?.trim()) {
    errors.occasion = "Please describe the holiday or occasion."
  }
  if (
    schedule.scheduleType === "seasonal" &&
    !schedule.seasonalPattern?.trim()
  ) {
    errors.seasonalPattern = "Please describe when this schedule applies."
  }
  if (
    schedule.timeType === "fixed" &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime || "")
  ) {
    errors.startTime = "Please enter a valid start time."
  }
  if (schedule.timeType === "variable" && !schedule.timeDescription?.trim()) {
    errors.timeDescription = "Please describe when this Minyan takes place."
  }
  return errors
}

export function formatMinyanTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value
  const [hours, minutes] = value.split(":").map(Number)
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${
    hours < 12 ? "AM" : "PM"
  }`
}

export function formatMinyanSchedule(schedule: MinyanSchedule): string {
  const prayer =
    schedule.prayerType === "Other"
      ? schedule.customPrayerName || "Other service"
      : schedule.prayerType || "Unspecified prayer"
  const recurrence =
    schedule.scheduleType === "weekly"
      ? (schedule.daysOfWeek || [])
          .map((day) => weekdays[day])
          .filter(Boolean)
          .join(", ")
      : schedule.scheduleType === "shabbos"
        ? schedule.shabbosPeriod
        : schedule.scheduleType === "yom-tov"
          ? schedule.occasion
          : schedule.scheduleType === "seasonal"
            ? schedule.seasonalPattern
            : "Unspecified recurrence"
  const time =
    schedule.timeType === "variable"
      ? schedule.timeDescription || "Time varies"
      : schedule.startTime
        ? formatMinyanTime(schedule.startTime)
        : "Time not entered"
  return [prayer, recurrence, time].filter(Boolean).join(" · ")
}

interface MinyanScheduleEditorProps {
  locationId: string
  locationLabel: string
  schedules: MinyanSchedule[]
  showErrors: boolean
  onAdd: () => void
  onChange: (scheduleId: string, changes: Partial<MinyanSchedule>) => void
  onRemove: (scheduleId: string) => void
  hideIntro?: boolean
  hideAddButton?: boolean
  hideRemoveAction?: boolean
}

export default function MinyanScheduleEditor({
  locationId,
  locationLabel,
  schedules,
  showErrors,
  onAdd,
  onChange,
  onRemove,
  hideIntro = false,
  hideAddButton = false,
  hideRemoveAction = false,
}: MinyanScheduleEditorProps) {
  return (
    <section
      className="minyan-schedules"
      aria-labelledby={hideIntro ? undefined : `schedule-heading-${locationId}`}
      aria-label={
        hideIntro ? `Minyan schedule for ${locationLabel}` : undefined
      }
    >
      {!hideIntro && (
        <div className="minyan-schedules__intro">
          <h3 id={`schedule-heading-${locationId}`}>Minyan Schedule</h3>
          <p>
            Add prayer times held at this location. Leave this empty if times
            are not yet known.
          </p>
        </div>
      )}
      {schedules.length === 0 && (
        <p className="minyan-schedules__empty">No Minyan times added yet.</p>
      )}
      {schedules.map((schedule, index) => {
        const errors = showErrors ? validateMinyanSchedule(schedule) : {}
        const fieldId = (name: string) => `${locationId}-${schedule.id}-${name}`
        const fieldError = (name: keyof ScheduleErrors) =>
          errors[name] ? (
            <small className="field-error" id={`${fieldId(name)}-error`}>
              {errors[name]}
            </small>
          ) : null
        const describedBy = (name: keyof ScheduleErrors) =>
          errors[name] ? `${fieldId(name)}-error` : undefined
        return (
          <div className="minyan-schedule" key={schedule.id}>
            <div className="minyan-schedule__head">
              <strong>Minyan Time {index + 1}</strong>
              {!hideRemoveAction && (
                <button
                  type="button"
                  onClick={() => onRemove(schedule.id)}
                  aria-label={`Remove Minyan time ${index + 1} from ${locationLabel}`}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="form-grid form-grid--2">
              <label
                className={`form-field ${errors.prayerType ? "has-error" : ""}`}
                htmlFor={fieldId("prayerType")}
              >
                <span>
                  Prayer Type <b aria-hidden="true">*</b>
                </span>
                <select
                  id={fieldId("prayerType")}
                  value={schedule.prayerType || ""}
                  onChange={(event) =>
                    onChange(schedule.id, {
                      prayerType: event.target.value as PrayerType,
                      customPrayerName: "",
                    })
                  }
                  aria-invalid={Boolean(errors.prayerType)}
                  aria-describedby={describedBy("prayerType")}
                >
                  <option value="">Select prayer</option>
                  {prayerTypes.map((prayer) => (
                    <option key={prayer} value={prayer}>
                      {prayer}
                    </option>
                  ))}
                </select>
                {fieldError("prayerType")}
              </label>
              <label
                className={`form-field ${
                  errors.scheduleType ? "has-error" : ""
                }`}
                htmlFor={fieldId("scheduleType")}
              >
                <span>
                  Schedule Type <b aria-hidden="true">*</b>
                </span>
                <select
                  id={fieldId("scheduleType")}
                  value={schedule.scheduleType || ""}
                  onChange={(event) =>
                    onChange(schedule.id, {
                      scheduleType: event.target.value as ScheduleType,
                      daysOfWeek: [],
                      shabbosPeriod: "",
                      occasion: "",
                      seasonalPattern: "",
                    })
                  }
                  aria-invalid={Boolean(errors.scheduleType)}
                  aria-describedby={describedBy("scheduleType")}
                >
                  <option value="">Select schedule</option>
                  <option value="weekly">Regular Weekly</option>
                  <option value="shabbos">Shabbos</option>
                  <option value="yom-tov">Yom Tov / Special</option>
                  <option value="seasonal">Seasonal / Varies</option>
                </select>
                {fieldError("scheduleType")}
              </label>
            </div>
            {schedule.prayerType === "Other" && (
              <label
                className={`form-field ${
                  errors.customPrayerName ? "has-error" : ""
                }`}
                htmlFor={fieldId("customPrayerName")}
              >
                <span>
                  Prayer or Service Name <b aria-hidden="true">*</b>
                </span>
                <input
                  id={fieldId("customPrayerName")}
                  value={schedule.customPrayerName || ""}
                  onChange={(event) =>
                    onChange(schedule.id, {
                      customPrayerName: event.target.value,
                    })
                  }
                  aria-invalid={Boolean(errors.customPrayerName)}
                  aria-describedby={describedBy("customPrayerName")}
                />
                {fieldError("customPrayerName")}
              </label>
            )}
            {schedule.scheduleType === "weekly" && (
              <div className="minyan-days">
                <span id={fieldId("daysOfWeek")}>
                  Days of the Week <b aria-hidden="true">*</b>
                </span>
                <div
                  className="minyan-days__choices"
                  role="group"
                  aria-labelledby={fieldId("daysOfWeek")}
                  aria-describedby={describedBy("daysOfWeek")}
                >
                  {weekdays.map((day, dayIndex) => (
                    <label
                      key={day}
                      className={
                        schedule.daysOfWeek?.includes(dayIndex)
                          ? "is-selected"
                          : ""
                      }
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(
                          schedule.daysOfWeek?.includes(dayIndex),
                        )}
                        onChange={() =>
                          onChange(schedule.id, {
                            daysOfWeek: schedule.daysOfWeek?.includes(dayIndex)
                              ? schedule.daysOfWeek.filter(
                                  (selected) => selected !== dayIndex,
                                )
                              : [
                                  ...(schedule.daysOfWeek || []),
                                  dayIndex,
                                ].sort(),
                          })
                        }
                      />
                      {day}
                    </label>
                  ))}
                </div>
                <div className="minyan-days__shortcuts">
                  <button
                    type="button"
                    onClick={() =>
                      onChange(schedule.id, { daysOfWeek: [1, 2, 3, 4, 5] })
                    }
                  >
                    Mon–Fri
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(schedule.id, { daysOfWeek: [0, 1, 2, 3, 4, 5] })
                    }
                  >
                    Sun–Fri
                  </button>
                </div>
                {fieldError("daysOfWeek")}
              </div>
            )}
            {schedule.scheduleType === "shabbos" && (
              <label
                className={`form-field ${
                  errors.shabbosPeriod ? "has-error" : ""
                }`}
                htmlFor={fieldId("shabbosPeriod")}
              >
                <span>
                  When on Shabbos <b aria-hidden="true">*</b>
                </span>
                <select
                  id={fieldId("shabbosPeriod")}
                  value={schedule.shabbosPeriod || ""}
                  onChange={(event) =>
                    onChange(schedule.id, { shabbosPeriod: event.target.value })
                  }
                  aria-invalid={Boolean(errors.shabbosPeriod)}
                  aria-describedby={describedBy("shabbosPeriod")}
                >
                  <option value="">Select period</option>
                  <option>Friday evening</option>
                  <option>Shabbos day</option>
                  <option>Motzaei Shabbos</option>
                </select>
                {fieldError("shabbosPeriod")}
              </label>
            )}
            {schedule.scheduleType === "yom-tov" && (
              <label
                className={`form-field ${errors.occasion ? "has-error" : ""}`}
                htmlFor={fieldId("occasion")}
              >
                <span>
                  Holiday or Occasion <b aria-hidden="true">*</b>
                </span>
                <input
                  id={fieldId("occasion")}
                  value={schedule.occasion || ""}
                  onChange={(event) =>
                    onChange(schedule.id, { occasion: event.target.value })
                  }
                  placeholder="Example: Rosh Hashanah morning"
                  aria-invalid={Boolean(errors.occasion)}
                  aria-describedby={describedBy("occasion")}
                />
                {fieldError("occasion")}
              </label>
            )}
            {schedule.scheduleType === "seasonal" && (
              <label
                className={`form-field ${
                  errors.seasonalPattern ? "has-error" : ""
                }`}
                htmlFor={fieldId("seasonalPattern")}
              >
                <span>
                  Season or Recurrence <b aria-hidden="true">*</b>
                </span>
                <input
                  id={fieldId("seasonalPattern")}
                  value={schedule.seasonalPattern || ""}
                  onChange={(event) =>
                    onChange(schedule.id, {
                      seasonalPattern: event.target.value,
                    })
                  }
                  placeholder="Example: Summer weekdays"
                  aria-invalid={Boolean(errors.seasonalPattern)}
                  aria-describedby={describedBy("seasonalPattern")}
                />
                {fieldError("seasonalPattern")}
              </label>
            )}
            <div className="minyan-time-type">
              <span>Time Type</span>
              <div
                role="group"
                aria-label={`Time type for Minyan time ${index + 1}`}
              >
                <label>
                  <input
                    type="radio"
                    name={fieldId("timeType")}
                    checked={schedule.timeType !== "variable"}
                    onChange={() =>
                      onChange(schedule.id, {
                        timeType: "fixed",
                        timeDescription: "",
                      })
                    }
                  />{" "}
                  Fixed Time
                </label>
                <label>
                  <input
                    type="radio"
                    name={fieldId("timeType")}
                    checked={schedule.timeType === "variable"}
                    onChange={() =>
                      onChange(schedule.id, {
                        timeType: "variable",
                        startTime: "",
                      })
                    }
                  />{" "}
                  Time Varies
                </label>
              </div>
            </div>
            {schedule.timeType === "variable" ? (
              <label
                className={`form-field ${
                  errors.timeDescription ? "has-error" : ""
                }`}
                htmlFor={fieldId("timeDescription")}
              >
                <span>
                  Time Description <b aria-hidden="true">*</b>
                </span>
                <input
                  id={fieldId("timeDescription")}
                  value={schedule.timeDescription || ""}
                  onChange={(event) =>
                    onChange(schedule.id, {
                      timeDescription: event.target.value,
                    })
                  }
                  placeholder="Example: 15 minutes before Shkiah"
                  aria-invalid={Boolean(errors.timeDescription)}
                  aria-describedby={describedBy("timeDescription")}
                />
                {fieldError("timeDescription")}
              </label>
            ) : (
              <label
                className={`form-field ${errors.startTime ? "has-error" : ""}`}
                htmlFor={fieldId("startTime")}
              >
                <span>
                  Start Time <b aria-hidden="true">*</b>
                </span>
                <input
                  id={fieldId("startTime")}
                  type="time"
                  lang="en-US"
                  value={schedule.startTime || ""}
                  onChange={(event) =>
                    onChange(schedule.id, { startTime: event.target.value })
                  }
                  aria-invalid={Boolean(errors.startTime)}
                  aria-describedby={describedBy("startTime")}
                />
                {schedule.startTime && (
                  <small>
                    {formatMinyanTime(schedule.startTime)} local time
                  </small>
                )}
                {fieldError("startTime")}
              </label>
            )}
            <label className="form-field" htmlFor={fieldId("notes")}>
              <span>Schedule Notes (optional)</span>
              <textarea
                id={fieldId("notes")}
                value={schedule.notes || ""}
                onChange={(event) =>
                  onChange(schedule.id, { notes: event.target.value })
                }
                placeholder="Example: Times change during winter. Please confirm with the Gabai."
                rows={3}
              />
            </label>
          </div>
        )
      })}
      {!hideAddButton && (
        <button
          id={`${locationId}-add-schedule`}
          type="button"
          className="button button--secondary minyan-schedules__add"
          onClick={onAdd}
        >
          + Add Minyan Time
        </button>
      )}
    </section>
  )
}
