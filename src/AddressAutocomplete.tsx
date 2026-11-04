import { useEffect, useId, useRef, useState } from 'react'
import './maps.css'
import { geoapifyRequest } from './lib/geoapify'

export type AddressSuggestion = {
  formatted: string
  address_line1?: string
  city?: string
  town?: string
  village?: string
  state?: string
  state_code?: string
  postcode?: string
  lat: number
  lon: number
}

const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY

export default function AddressAutocomplete({ value, onChange, onSelect, label = "Street Address", required = true }: {
  label?: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  onSelect: (address: AddressSuggestion) => void
}) {
  const id = useId()
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [active, setActive] = useState(-1)
  const [focused, setFocused] = useState(false)
  const [status, setStatus] = useState('')
  const selected = useRef(value)
  const cache = useRef(new Map<string, AddressSuggestion[]>())
  useEffect(() => {
    setSuggestions([])
    setActive(-1)
    setStatus('')
    if (!apiKey || !focused || value.trim().length < 3 || value === selected.current) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setStatus('Searching addresses…')
      try {
        const query = value.trim()
        let items = cache.current.get(query)
        if (!items) {
          const body = await geoapifyRequest('autocomplete', { text: query, limit: '5' }, controller.signal)
          items = (body.results ?? []).filter((item: AddressSuggestion) =>
            typeof item.formatted === 'string' && Number.isFinite(item.lat) && Number.isFinite(item.lon))
          if (cache.current.size > 100) cache.current.clear()
          cache.current.set(query, items!)
        }
        if (controller.signal.aborted) return
        setSuggestions(items!)
        setStatus(items!.length ? '' : 'No suggestions found. You can enter the address manually.')
      } catch {
        if (!controller.signal.aborted) setStatus('Address suggestions are unavailable. You can enter the address manually.')
      }
    }, 500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [value, focused])
  const choose = (item: AddressSuggestion) => {
    selected.current = item.address_line1 || item.formatted
    setSuggestions([])
    setFocused(false)
    setStatus('Address selected. Check the details and map pin below.')
    onSelect(item)
  }
  return <div className="address-autocomplete">
    <label htmlFor={id}>{label} {required && <span aria-hidden="true">*</span>}</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={focused && suggestions.length > 0}
      aria-controls={`${id}-results`} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
      aria-describedby={`${id}-hint`} autoComplete="off" required={required} value={value}
      placeholder="Start typing a street address" onChange={event => { selected.current = ''; onChange(event.target.value) }}
      onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setActive(-1) }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setFocused(false); setActive(-1) }
        if (!focused || !suggestions.length) return
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % suggestions.length) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index <= 0 ? suggestions.length : index) - 1) }
        if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(suggestions[active]) }
      }} />
    {focused && suggestions.length > 0 && <ul id={`${id}-results`} role="listbox" aria-label="Address suggestions">
      {suggestions.map((item, index) => <li key={`${item.lat}-${item.lon}-${index}`} id={`${id}-${index}`} role="option" aria-selected={active === index}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(item)} onMouseEnter={() => setActive(index)}>{item.formatted}</li>)}
    </ul>}
    <small id={`${id}-hint`} aria-live="polite">{status || (apiKey ? 'Choose a suggestion or enter your address manually.' : 'Enter your address manually. Address suggestions will be available once configured.')}</small>
    {apiKey && <small>Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></small>}
  </div>
}
