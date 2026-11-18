/**
 * The free backend host pauses the server after a while with no visitors, and the
 * first request then waits while it starts. These helpers make that wait visible
 * and survivable instead of looking like a broken app.
 */

import { useEffect, useState } from 'react'

import { ApiError } from './api/client'
import { api } from './api/endpoints'

/** 502/503/504: what a proxy answers while the server behind it is still starting. */
export function isServerWaking(error: unknown): boolean {
  return error instanceof ApiError && [502, 503, 504].includes(error.status)
}

/**
 * How long to keep retrying while the server wakes. A sleeping free server has
 * taken ~45s to start, so: up to 6 retries, waiting 2, 4, 8, 10, 10, 10 seconds
 * (about 45s of waiting, plus each request's own time).
 */
export const WAKING_RETRIES = 6

export function wakingRetryDelay(attemptIndex: number): number {
  return Math.min(2000 * 2 ** attemptIndex, 10_000)
}

/** Retry rule for requests that are safe to repeat: only while the server is waking. */
export function retryWhileWaking(failureCount: number, error: Error): boolean {
  return isServerWaking(error) && failureCount < WAKING_RETRIES
}

let pinged = false

/**
 * On login and signup, start waking the server straight away (once per page load),
 * so it's usually ready by the time the visitor has typed. Only in the deployed app.
 */
export function useWakeServer(enabled: boolean = import.meta.env.PROD): void {
  useEffect(() => {
    if (!enabled || pinged) return
    pinged = true
    api.health().catch(() => {
      // Only a nudge: real requests report their own errors.
    })
  }, [enabled])
}

/** For tests. */
export function resetWakePing(): void {
  pinged = false
}

/** True once `active` has stayed true for `delayMs`: time to explain the wait. */
export function useSlowNotice(active: boolean, delayMs = 3000): boolean {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setSlow(true), delayMs)
    return () => {
      // Runs when the wait ends (or the component goes away): start fresh next time.
      clearTimeout(timer)
      setSlow(false)
    }
  }, [active, delayMs])

  return active && slow
}

export const WAKING_MESSAGE =
  "Waking up the server. The free hosting plan pauses it when nobody's using it, so this can take up to a minute."
