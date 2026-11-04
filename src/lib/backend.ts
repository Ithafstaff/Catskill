import type { User as AuthUser } from "@supabase/supabase-js"
import type { Listing, User } from "../Community"
import { supabase } from "./supabase"

export type ReviewEvent = {
  id: string
  action: string
  feedback: string
  createdAt: string
  versionId?: string
  internalNote?: string
  actor?: string
}
export function backendError(error: unknown): string {
  const value = error as {
    message?: string
    code?: string
  }
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(value?.code || ""))
    return "The database setup has not been applied yet. Run the moderation migration in Supabase, then retry."
  return (
    value?.message ||
    "We could not reach the server. Please retry; your edits have not been cleared."
  )
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(backendError(error))
  return data as T
}
export async function applicationUser(authUser: AuthUser): Promise<User> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,phone,role")
    .eq("id", authUser.id)
    .single()
  if (error) throw new Error(backendError(error))
  return {
    id: data.id,
    name: data.display_name,
    phone: data.phone,
    role: data.role,
    email: authUser.email || "",
  }
}
export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return applicationUser(data.user)
}
export async function saveRemoteListing(
  item: Listing,
  legacyId?: string,
): Promise<Listing> {
  return rpc<Listing>("save_listing", {
    p_payload: item,
    p_listing_id: item.versionId ? item.id : null,
    p_expected_version: item.versionId || null,
    p_expected_updated_at: item.versionId ? item.updatedAt : null,
    p_submit: !legacyId && item.status === "Pending Review",
    p_legacy_id: legacyId || null,
  })
}
export async function updateProfile(user: User): Promise<User> {
  const name = user.name.trim()
  if (!name) throw new Error("Please enter your name.")
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, phone: user.phone.trim() })
    .eq("id", user.id)
  if (error) throw new Error(backendError(error))
  return { ...user, name, phone: user.phone.trim() }
}
