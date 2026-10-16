import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataErrorCode, DataResult } from '../lib/data'

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'error'; code: DataErrorCode }
  | { status: 'done'; data: T }

/** Runs a data call when the screen opens (and again on `reload()`), and reports loading / error / done. */
export function useLoad<T>(load: (() => Promise<DataResult<T>>) | null, deps: unknown[]): { state: Loaded<T>; reload: () => void } {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const fn = loadRef.current
    if (!fn) return
    let cancelled = false
    setState((s) => (s.status === 'done' ? s : { status: 'loading' }))
    void fn().then((r) => {
      if (cancelled) return
      setState(r.ok ? { status: 'done', data: r.data } : { status: 'error', code: r.code })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { state, reload }
}
