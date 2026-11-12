import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"

export default function useCoverPhotoUrl(path?: string | null, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ path: "", url: "", error: false })
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    setState({ path: path || "", url: "", error: false })
    if (!path || !enabled) return
    async function load() {
      try {
        const { data, error } = await supabase.storage.from("listing-covers").createSignedUrl(path!, 600)
        if (!active) return
        setState({ path: path!, url: error ? "" : data.signedUrl, error: Boolean(error) })
        if (!error) timer = setTimeout(load, 8 * 60 * 1000)
      } catch {
        if (active) setState({ path: path!, url: "", error: true })
      }
    }
    void load()
    return () => { active = false; clearTimeout(timer) }
  }, [path, enabled, attempt])
  const current = state.path === path && enabled
  return {
    url: current ? state.url : "",
    error: current && state.error,
    retry: () => setAttempt(value => value + 1),
  }
}
