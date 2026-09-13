// OpenCode Go quota fetch + a phone-style battery bar.
//
// Primary path: the OpenCode Go API with the provider API key from
// `opencode auth` (auth.json). The key is stable, so the battery keeps working
// for months, unlike the browser `auth` cookie which expires after a few days.
// Fallback path: scrape the workspace page with OPENCODE_GO_AUTH_COOKIE, kept
// for compatibility with @whosydd/opencode-quota (MIT).
import { createSignal } from "solid-js"

export interface GoQuota {
  rollingPercentRemaining: number
  rollingResetInSec: number
  fetchedAt: number
}

/** Default OpenCode Go API base; `/usage` is appended. */
export const GO_API_BASE = "https://opencode.ai/zen/go/v1"

interface GoCredentials {
  apiKey?: string
  workspaceId?: string
  authCookie?: string
}

function readConfig(): GoCredentials | undefined {
  const env = (globalThis as typeof globalThis & {
    process?: { env: Record<string, string | undefined> }
  }).process?.env
  const apiKey = env?.OPENCODE_GO_API_KEY?.trim()
  if (apiKey) return { apiKey }
  const workspaceId = env?.OPENCODE_GO_WORKSPACE_ID?.trim()
  const authCookie = env?.OPENCODE_GO_AUTH_COOKIE?.trim()
  if (!workspaceId || !authCookie) return undefined
  if (!/^wrk_[A-Za-z0-9_-]+$/.test(workspaceId)) return undefined
  if (authCookie.length < 10) return undefined
  return { workspaceId, authCookie }
}

interface WindowUsage {
  quotaPercent: number
  resetInSec: number
}

/** Thrown when the Go API key or auth cookie is missing, expired, or rejected. */
export class QuotaAuthError extends Error {}

function timeoutSignal(ms: number): AbortSignal | undefined {
  const withTimeout = AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }
  return typeof withTimeout.timeout === "function" ? withTimeout.timeout(ms) : undefined
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

export async function fetchGoQuota(signal?: AbortSignal): Promise<GoQuota | undefined> {
  const config = readConfig()
  if (!config) return undefined
  if (config.apiKey) return fetchQuotaFromApi(config.apiKey, signal)
  return fetchQuotaFromCookie(config as Required<Pick<GoCredentials, "workspaceId" | "authCookie">>, signal)
}

/**
 * Stable path: `GET /zen/go/v1/usage` with the provider API key. Returns rounded
 * percents and ISO `resetsAt` timestamps for the rolling/weekly/monthly windows.
 */
async function fetchQuotaFromApi(apiKey: string, signal?: AbortSignal): Promise<GoQuota | undefined> {
  const response = await fetch(`${GO_API_BASE}/usage`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
  })
  if (response.status === 401 || response.status === 403) {
    throw new QuotaAuthError(`OpenCode Go API authentication failed (HTTP ${response.status})`)
  }
  if (!response.ok) throw new Error(`OpenCode Go API request failed with HTTP ${response.status}`)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return undefined
  }
  const rolling = readObject(readObject(payload, "usage"), "rolling")
  if (!rolling) return undefined
  const percent = asNumber(rolling.percent)
  if (percent === null) return undefined
  return {
    rollingPercentRemaining: clampPercent(100 - Math.round(percent)),
    rollingResetInSec: secondsUntil(rolling.resetsAt),
    fetchedAt: Date.now(),
  }
}

/** Fallback path: scrape the workspace HTML page with the browser auth cookie. */
async function fetchQuotaFromCookie(
  config: { workspaceId: string; authCookie: string },
  signal?: AbortSignal,
): Promise<GoQuota | undefined> {
  const response = await fetch(
    `https://opencode.ai/workspace/${encodeURIComponent(config.workspaceId)}/go`,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: `auth=${config.authCookie}`,
        "User-Agent": "opencode-go-price/0.1.0",
      },
      signal,
    },
  )
  if (response.status === 401 || response.status === 403) {
    throw new QuotaAuthError(`OpenCode Go authentication failed (HTTP ${response.status})`)
  }
  // An expired session redirects to the OpenAuth login page instead of a 401,
  // so treat the redirect as an auth failure rather than silently serving stale data.
  if (response.redirected || /auth\.opencode\.ai|\/auth\//.test(response.url)) {
    throw new QuotaAuthError("OpenCode Go session expired (redirected to login)")
  }
  if (!response.ok) throw new Error(`OpenCode Go request failed with HTTP ${response.status}`)
  const html = await response.text()
  const rolling = extractWindow(html, "rollingUsage")
  if (!rolling) return undefined
  return {
    rollingPercentRemaining: clampPercent(100 - rolling.quotaPercent),
    rollingResetInSec: rolling.resetInSec,
    fetchedAt: Date.now(),
  }
}

function readObject(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null
  const nested = (value as Record<string, unknown>)[key]
  return typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : null
}

/** Seconds until an ISO timestamp, clamped at zero. Unknown timestamps read as 0. */
function secondsUntil(value: unknown): number {
  if (typeof value !== "string") return 0
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return 0
  return Math.max(0, Math.round((at - Date.now()) / 1000))
}

function extractWindow(html: string, fieldName: string): WindowUsage | null {
  const objectLiteral = extractObjectLiteral(html, fieldName)
  if (!objectLiteral) return null
  let parsed: Record<string, unknown>
  try {
    parsed = parseLooseObjectLiteral(objectLiteral)
  } catch {
    return null
  }
  const quotaPercent = asNumber(parsed.usagePercent)
  const resetInSec = asNumber(parsed.resetInSec)
  if (quotaPercent === null || resetInSec === null) return null
  return {
    quotaPercent: Math.round(quotaPercent),
    resetInSec: Math.max(0, Math.round(resetInSec)),
  }
}

function extractObjectLiteral(html: string, fieldName: string): string | null {
  const patterns = [
    new RegExp(`${escapeRegExp(fieldName)}\\s*:\\s*\\$R\\[\\d+\\]\\s*=\\s*\\{`),
    new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`),
    new RegExp(`${escapeRegExp(fieldName)}\\s*:\\s*\\{`),
    new RegExp(`${escapeRegExp(fieldName)}\\s*=\\s*\\{`),
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (!match || match.index === undefined) continue
    const start = match.index + match[0].lastIndexOf("{")
    const objectLiteral = readObjectLiteral(html, start)
    if (objectLiteral) return objectLiteral
  }
  return null
}

function readObjectLiteral(html: string, start: number): string | null {
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (escaped) {
      escaped = false
      continue
    }
    if ((inSingleQuote || inDoubleQuote || inBacktick) && char === "\\") {
      escaped = true
      continue
    }
    if (!inDoubleQuote && !inBacktick && char === "'") {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (!inSingleQuote && !inBacktick && char === '"') {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && char === "`") {
      inBacktick = !inBacktick
      continue
    }
    if (inSingleQuote || inDoubleQuote || inBacktick) continue
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return html.slice(start, index + 1)
    }
  }
  return null
}

function parseLooseObjectLiteral(input: string): Record<string, unknown> {
  const normalized = input
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'((?:\\.|[^'\\])*)'/g, (_, value: string) => `"${value.replace(/"/g, '\\"')}"`)
    .replace(/("(?:\\.|[^"\\])*")|\bundefined\b/g, (match, quoted) => quoted ?? "null")
    .replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(normalized) as Record<string, unknown>
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Reactive quota holder with a periodic refresh. Created inside the plugin
 * factory so it is disposed with the plugin scope. The first request is lazy:
 * call `ensure()` once a Go model is on screen. Requests are serialized and
 * time-bounded, so a hung server cannot pile up overlapping fetches; an auth
 * failure clears the value instead of showing a stale quota forever.
 */
export function createQuotaStore(refreshMs = 120_000, timeoutMs = 15_000): {
  quota: () => GoQuota | undefined
  ensure: () => void
  dispose: () => void
} {
  const [quota, setQuota] = createSignal<GoQuota | undefined>(undefined)
  let inFlight = false
  let started = false
  let disposed = false
  let timer: ReturnType<typeof setInterval> | undefined

  const fetchOnce = async () => {
    if (inFlight || disposed) return
    inFlight = true
    try {
      const value = await fetchGoQuota(timeoutSignal(timeoutMs))
      if (value) setQuota(value)
    } catch (error) {
      // Keep the last value on transient/network/timeout errors, but drop it
      // when authentication fails so an expired credential is visible.
      if (error instanceof QuotaAuthError) setQuota(undefined)
    } finally {
      inFlight = false
    }
  }

  const ensure = () => {
    if (disposed || started) return
    started = true
    void fetchOnce()
    timer = setInterval(() => void fetchOnce(), refreshMs)
  }

  const dispose = () => {
    disposed = true
    if (timer) clearInterval(timer)
    timer = undefined
  }

  return { quota, ensure, dispose }
}
