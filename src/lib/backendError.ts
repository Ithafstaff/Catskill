const safeMessages = new Set([
  "We could not complete the request. Please retry; your edits have not been cleared.",
  "Email or password is incorrect.",
  "If this address already has an account, sign in or request a password reset.",
  "Verify your email address before signing in. You can resend the confirmation email below.",
  "Please wait a minute before requesting another email, then try again.",
  "The database setup has not been applied yet. Run the moderation migration in Supabase, then retry.",
  "A listing may have at most 25 additional locations.",
  "A location may have at most 100 schedules.",
  "Access denied.",
  "Additional locations require a name and address.",
  "Administrator access required.",
  "Another reviewer already decided this submission. Refresh the queue.",
  "Archived listings cannot be edited.",
  "Audit history is append-only.",
  "Complete all prayer schedule fields before submitting.",
  "Confirm accuracy and authorization before submitting.",
  "Confirm permission to publish contact details.",
  "Contributor feedback is required.",
  "Detail fields must be text of at most 10000 characters.",
  "Detail fields must be text.",
  "Expected an object.",
  "Incompatible record; please re-enter it.",
  "Invalid listing parameters.",
  "Invalid or oversized listing.",
  "Invalid review decision.",
  "Listing not found.",
  "Listing type cannot be changed.",
  "Listing visibility changed. Refresh and try again.",
  "Locations must be an array.",
  "Name and complete address are required.",
  "Notification lease expired or already completed.",
  "Only a current draft can be deleted.",
  "Only a previously approved listing can be restored.",
  "Please enter your name.",
  "Please sign in with a verified email address.",
  "Profile name or phone exceeds the length limit.",
  "Provide appointment guidance and the required appointment phone.",
  "Published version must be approved and belong to this listing.",
  "Schedule days must be an array.",
  "Schedule days must be weekdays from 0 through 5.",
  "Schedules must be an array.",
  "Submission not found.",
  "Submitted detail records cannot be edited.",
  "Submitted snapshots cannot be edited.",
  "Text fields have an invalid type or exceed the length limit.",
  "The account profile did not match the signed-in user.",
  "This listing changed. Refresh before saving.",
  "This submission is awaiting review. Wait for a decision before editing.",
  "Too many listing saves. Please wait a minute and retry.",
  "We could not reach the server. Please retry; your edits have not been cleared.",
  "You do not own this listing.",
  "Your password was updated, but we could not sign out. Please retry below to finish securely.",
])

/** Never render arbitrary database, network or provider diagnostics in the browser. */
export function backendError(error: unknown): string {
  const value = error as {
    message?: string
    code?: string
    status?: number
  }
  if (value?.code === "email_not_confirmed")
    return "Verify your email address before signing in. You can resend the confirmation email below."
  if (
    value?.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      value?.code || "",
    )
  )
    return "Please wait a minute before requesting another email, then try again."
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(value?.code || ""))
    return "The database setup has not been applied yet. Run the moderation migration in Supabase, then retry."
  if (value?.code === "invalid_credentials")
    return "Email or password is incorrect."
  if (["user_already_exists", "email_exists"].includes(value?.code || ""))
    return "If this address already has an account, sign in or request a password reset."
  if (value?.code === "PT429")
    return "Too many listing saves. Please wait a minute and retry."
  if (value?.message && safeMessages.has(value.message)) return value.message
  return "We could not complete the request. Please retry; your edits have not been cleared."
}
