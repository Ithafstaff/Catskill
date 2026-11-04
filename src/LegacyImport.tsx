import { useState } from "react"
import type { Listing, User } from "./Community"
import { CommunityButton } from "./Community"
import { backendError, saveRemoteListing } from "./lib/backend"

export default function LegacyImport({
  user,
  onImported,
}: {
  user: User
  onImported: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [report, setReport] = useState("")
  const [dismissed, setDismissed] = useState(false)
  let candidates: unknown[] = []
  try {
    const legacyUser = JSON.parse(localStorage.getItem("ce-user") || "null")
    const stored = JSON.parse(localStorage.getItem("ce-listings") || "[]")
    if (
      Array.isArray(stored) &&
      legacyUser?.id &&
      legacyUser?.email?.toLowerCase() === user.email.toLowerCase()
    )
      candidates = stored.filter(
        (item) => item?.ownerId === legacyUser.id && !item?.data?.sourceUrl,
      )
  } catch {
    return (
      <p role="alert">
        Old browser data could not be read. Re-enter your listings or contact
        support; the original data has not been changed.
      </p>
    )
  }
  if (!candidates.length || dismissed) return null
  return (
    <section className="admin-panel">
      <h2>Import your old browser listings</h2>
      <p>
        Found {candidates.length} records associated with your previous local
        account. They will be imported as private drafts. Nothing is published
        automatically.
      </p>
      <label>
        <input
          type="checkbox"
          disabled={busy}
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />{" "}
        I own these records and am authorized to submit their information.
      </label>
      <p>
        <CommunityButton
          disabled={busy || !acknowledged}
          onClick={async () => {
            setBusy(true)
            let imported = 0
            const failed: string[] = []
            for (const raw of candidates) {
              const item = raw as Listing
              try {
                if (
                  !item.id ||
                  !["Mikvah", "Shul"].includes(item.type) ||
                  !item.data ||
                  typeof item.data !== "object"
                )
                  throw new Error("Incompatible record; please re-enter it.")
                await saveRemoteListing(
                  { ...item, versionId: undefined, status: "Draft" },
                  item.id,
                )
                imported++
              } catch (error) {
                failed.push(
                  `${item.name || item.id || "Unknown record"}: ${backendError(error)}`,
                )
              }
            }
            setReport(
              `${imported} drafts imported or already present.${
                failed.length
                  ? ` Could not import: ${failed.join("; ")}`
                  : " You can review them in your dashboard. Repeating the import will not create duplicates."
              }`,
            )
            try {
              await onImported()
            } catch (error) {
              setReport((current) => `${current} ${backendError(error)}`)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? "Importing…" : "Import as drafts"}
        </CommunityButton>{" "}
        <button disabled={busy} onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </p>
      {report && <p role="status">{report}</p>}
    </section>
  )
}
