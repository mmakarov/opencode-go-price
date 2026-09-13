/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { migrateLegacyRanges, sanitizeRanges } from "./ranges.ts"
import { DEFAULT_RANGES, DEFAULT_SLOT_ORDER, KV_RANGES_KEY, WEEKDAY_DEFAULT_DAYS } from "./config.ts"
import type { DsPeakOptions, TimeRange } from "./types.ts"
import { openConfigMenu } from "./dialogs.tsx"
import { PeakPanel } from "./panel.tsx"
import { PeakHomeIndicator } from "./home.tsx"
import { createQuotaStore } from "./quota.ts"

/**
 * Resolve the effective peak windows. Each entry may carry a day-of-week
 * pattern. Precedence: saved KV value > plugin `ranges` option > built-in
 * weekday defaults.
 */
function loadRanges(api: TuiPluginApi, opts: Partial<DsPeakOptions>): TimeRange[] {
  try {
    // Prefer what the user last saved through /dspeak (day patterns included).
    const fromKv = api.kv.get<unknown>(KV_RANGES_KEY)
    if (Array.isArray(fromKv)) {
      const cleaned = sanitizeRanges(fromKv)
      if (cleaned.length) return migrateLegacyRanges(cleaned, WEEKDAY_DEFAULT_DAYS)
    }
  } catch {
    // ignore kv read errors, fall through
  }
  const fromOpts = opts.ranges
  if (Array.isArray(fromOpts) && fromOpts.length) {
    const cleaned = sanitizeRanges(fromOpts)
    if (cleaned.length) return migrateLegacyRanges(cleaned, WEEKDAY_DEFAULT_DAYS)
  }
  return DEFAULT_RANGES.map((r) => ({ ...r, days: r.days ? [...r.days] : undefined }))
}

/**
 * Resolve the OpenCode Go provider API key so the quota battery can use the
 * stable `/zen/go/v1/usage` API instead of the short-lived browser cookie.
 * Order: live provider state, an explicit env override, then auth.json on disk.
 */
async function resolveGoApiKey(api: TuiPluginApi): Promise<string | undefined> {
  const env = (globalThis as typeof globalThis & {
    process?: { env: Record<string, string | undefined> }
  }).process?.env
  try {
    const provider = api.state.provider.find((entry) => entry.id === "opencode-go")
    if (provider?.key) return provider.key
  } catch {
    // provider state may be unavailable early in startup
  }
  if (env?.OPENCODE_GO_API_KEY) return env.OPENCODE_GO_API_KEY
  try {
    const [{ existsSync, readFileSync }, path, os] = await Promise.all([
      import("node:fs"),
      import("node:path"),
      import("node:os"),
    ])
    const dataDir = env?.XDG_DATA_HOME
      ? path.join(env.XDG_DATA_HOME, "opencode")
      : path.join(os.homedir(), ".local", "share", "opencode")
    const file = path.join(dataDir, "auth.json")
    if (!existsSync(file)) return undefined
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, { type?: string; key?: string }>
    const entry = parsed["opencode-go"]
    if (entry?.type === "api" && typeof entry.key === "string" && entry.key) return entry.key
  } catch {
    // no API key on disk; fall back to the cookie path in quota.ts
  }
  return undefined
}

const tui: TuiPlugin = async (api, options) => {
  const opts = (options ?? {}) as Partial<DsPeakOptions>
  const [ranges, setRanges] = createSignal<TimeRange[]>(loadRanges(api, opts))

  // Prefer the durable API key for the quota battery (cookie is the fallback).
  const proc = (globalThis as typeof globalThis & {
    process?: { env: Record<string, string | undefined> }
  }).process
  const apiKey = await resolveGoApiKey(api)
  if (apiKey && proc && !proc.env.OPENCODE_GO_API_KEY) proc.env.OPENCODE_GO_API_KEY = apiKey

  // Update in-memory state and persist to KV so edits survive restarts.
  const save = (next: TimeRange[]) => {
    setRanges(next)
    try {
      api.kv.set(KV_RANGES_KEY, next)
    } catch {
      // kv may be unavailable; keep in-memory state
    }
  }

  const order = typeof opts.order === "number" ? opts.order : DEFAULT_SLOT_ORDER

  // Rolling 5h quota (battery). Disposed with the plugin scope.
  const quotaStore = createQuotaStore()
  api.lifecycle.onDispose(() => quotaStore.dispose())

  // Register each slot separately: if a slot name is unknown to this host it
  // must not block the others. Distinct order values avoid the duplicate-order
  // rejection the host applies to separate registrations.
  const registerSlot = (slotOrder: number, name: string, render: (ctx: any, props: any) => unknown) => {
    try {
      api.slots.register({ order: slotOrder, slots: { [name]: render } } as never)
    } catch (err) {
      api.ui.toast({
        variant: "error",
        title: "opencode-go-price",
        message: `slot ${name} failed: ${(err as Error).message}`,
      })
    }
  }

  registerSlot(order, "sidebar_content", (ctx: any, props: any) => (
    <PeakPanel theme={ctx.theme.current} ranges={ranges} api={api} sessionID={props?.session_id} quota={quotaStore.quota} ensureQuota={quotaStore.ensure} />
  ))
  registerSlot(order + 1, "home_prompt_right", (ctx: any) => (
    <PeakHomeIndicator theme={ctx.theme.current} ranges={ranges} api={api} quota={quotaStore.quota} ensureQuota={quotaStore.ensure} />
  ))
  registerSlot(order + 2, "session_prompt_right", (ctx: any, props: any) => (
    <PeakHomeIndicator theme={ctx.theme.current} ranges={ranges} api={api} sessionID={props?.session_id} quota={quotaStore.quota} ensureQuota={quotaStore.ensure} />
  ))

  // Back the /dspeak command with the config menu dialogs.
  const configure = () => openConfigMenu(api, ranges, save)

  let commandRegistered = false
  try {
    // Primary path: keymap layer exposing a slash command + palette entry.
    api.keymap.registerLayer({
      commands: [
        {
          name: "ds.peak.configure",
          title: "DeepSeek Peak: configure time ranges",
          category: "Plugin",
          namespace: "palette",
          slashName: "dspeak",
          run: configure,
        },
      ],
    })
    commandRegistered = true
  } catch {
    commandRegistered = false
  }

  // Fallback path for older runtimes that lack keymap layers.
  if (!commandRegistered && api.command) {
    api.command.register(() => [
      {
        title: "DeepSeek Peak: configure time ranges",
        value: "ds.peak.configure",
        category: "Plugin",
        slash: { name: "dspeak" },
        onSelect: configure,
      },
    ])
  }
}

// Plugin module contract: `id` scopes KV keys; `tui` wires up the TUI.
const plugin: TuiPluginModule = {
  id: "opencode-go-price",
  tui,
}

export default plugin