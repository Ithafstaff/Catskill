import type { User as AuthUser } from '@supabase/supabase-js'
import type { User } from './Community'

export type ProfileState = { user: User | null; loading: boolean; error: string }

/** Profile refreshes must not remove a same-account editor from the page. */
export function createProfileSessionController({ load, onChange, onIdentityChange }: {
  load: (user: AuthUser) => Promise<User>
  onChange: (state: ProfileState) => void
  onIdentityChange: () => void
}) {
  let state: ProfileState = { user: null, loading: true, error: '' }
  let identity: string | null = null
  let revision = 0
  let active = true
  const publish = (next: ProfileState) => { state = next; onChange(next) }
  return {
    receive(authUser: AuthUser | null) {
      if (!active) return
      const request = ++revision
      const nextIdentity = authUser?.id || null
      if (identity !== nextIdentity) {
        identity = nextIdentity
        onIdentityChange()
      }
      if (!authUser) { publish({ user: null, loading: false, error: '' }); return }
      const previous = state.user?.id === authUser.id ? state.user : null
      publish({ user: previous, loading: !previous, error: '' })
      // Auth callbacks must return before making further Supabase requests.
      void Promise.resolve().then(() => load(authUser)).then(profile => {
        if (!active || request !== revision) return
        if (profile.id !== authUser.id) throw new Error('The account profile did not match the signed-in user.')
        publish({ user: profile, loading: false, error: '' })
      }).catch(error => {
        if (!active || request !== revision) return
        const retained = state.user?.id === authUser.id ? state.user : null
        publish({ user: retained, loading: false, error: error instanceof Error ? error.message : 'Your account could not be refreshed. Please retry.' })
      })
    },
    adopt(profile: User) {
      if (active && profile.id === identity) { ++revision; publish({ user: profile, loading: false, error: '' }) }
    },
    stop() { active = false; ++revision },
  }
}
