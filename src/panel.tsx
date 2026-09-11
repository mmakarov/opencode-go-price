/** @jsxImportSource @opentui/solid */
import { createEffect, Show, getOwner } from "solid-js"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { formatDays, formatDuration, formatMinutes, localMinutes } from "./ranges.ts"
import { DAY_LABELS } from "./config.ts"
import type { TimeRange } from "./types.ts"
import { usePeakStatus } from "./status.ts"
import { outputPrice } from "./goprice.ts"
import { selectedModelReader } from "./selected-model.ts"
import { type GoQuota } from "./quota.ts"
import { Battery } from "./battery.tsx"

export interface PeakPanelProps {
  theme: TuiThemeCurrent
  ranges: () => TimeRange[]
  api: TuiPluginApi
  sessionID?: string
  quota: () => GoQuota | undefined
  ensureQuota: () => void
}

const MS_MIN = 60_000

/** Sidebar panel sized for a narrow column: short lines, no overflowing rows. */
export function PeakPanel(props: PeakPanelProps) {
  const selectedModel = selectedModelReader(getOwner())
  const { now, time, status, transition, local, tz } = usePeakStatus(props.ranges)
  const peak = () => status().peak

  // Only render for OpenCode Go models that have a known output price.
  const model = () => {
    void now() // re-evaluate on the status tick
    const current = selectedModel()
    if (!current || current.providerID !== "opencode-go") return undefined
    const value = outputPrice(current.id, peak())
    if (value === undefined) return undefined
    return { id: current.id, value }
  }

  // City-only timezone label ("Asia/Damascus" -> "Damascus").
  const city = tz.includes("/") ? tz.split("/").pop()!.replace(/_/g, " ") : tz

  // Next flip shown in the machine's local timezone; a weekday label is added
  // only when it lands on another local day.
  const localDayKey = (at: Date) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(at)
    } catch {
      return at.toISOString().slice(0, 10)
    }
  }
  const atLabel = () => {
    const at = transition().at
    const clock = formatMinutes(localMinutes(at, tz))
    if (localDayKey(at) === localDayKey(now())) return clock
    let weekday = DAY_LABELS[at.getUTCDay()]
    try {
      weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at)
    } catch {
      // keep UTC-derived weekday
    }
    return `${weekday} ${clock}`
  }

  // Minutes until the next flip (the scan aligns to whole minutes).
  const untilLabel = () => formatDuration(Math.round((transition().at.getTime() - now().getTime()) / MS_MIN))

  // Rolling 5h quota as a battery bar.
  const remaining = () => {
    void now()
    return props.quota()?.rollingPercentRemaining
  }
  const resetLabel = () => {
    const seconds = props.quota()?.rollingResetInSec
    return seconds === undefined ? "" : formatDuration(Math.round(seconds / 60))
  }
  const battColor = () => {
    const value = remaining()
    if (value === undefined) return props.theme.textMuted
    if (value >= 50) return props.theme.success
    if (value >= 20) return props.theme.warning
    return props.theme.error ?? props.theme.warning
  }

  // Start the lazy quota fetch only once a Go model is actually shown.
  createEffect(() => {
    if (model()) props.ensureQuota()
  })

  return (
    <box visible={Boolean(model())} flexShrink={0}>
    <Show when={model()}>
      {(info) => (
        <box flexShrink={0} paddingTop={1} paddingBottom={1}>
          <text fg={props.theme.text}>
            <b>{info().id}</b>
          </text>
          {/* Remaining 5h limit as a battery, then the bare output price */}
          <box flexDirection="row">
            <text fg={battColor()}>{"\u25CF 5h "}</text>
            <Show when={remaining() !== undefined} fallback={<text fg={battColor()}>{"—"}</text>}>
                <>
                  <Battery percent={remaining()!} color={battColor()} theme={props.theme} />
                  <text fg={battColor()}>{` ${Math.round(remaining()!)}%${resetLabel() ? ` · ${resetLabel()}` : ""}`}</text>
                </>
            </Show>
          </box>
          <text fg={peak() ? props.theme.warning : props.theme.success}>
            ${info().value.toFixed(2)}
          </text>
          <text fg={props.theme.textMuted}>
            UTC {formatMinutes(time())} · {formatMinutes(local())} {city}
          </text>
          {/* Next switch, day-of-week aware */}
          <text fg={props.theme.textMuted}>
            Next: {transition().to ? "peak" : "off-peak"} {atLabel()} {city}
          </text>
          {/* Its own countdown row */}
          <text fg={props.theme.textMuted}>in {untilLabel()}</text>
          <text fg={props.theme.textMuted}>Windows (UTC):</text>
          {/* One short row per window; the Next line above carries the countdown */}
          {props.ranges().map((r) => {
            const tag = formatDays(r.days)
            return (
              <text fg={props.theme.warning}>
                {r.start}-{r.end}
                {tag ? ` ${tag}` : ""}
              </text>
            )
          })}
          <text fg={props.theme.textMuted}>otherwise off-peak</text>
          <text fg={props.theme.textMuted}>edit: /dspeak</text>
        </box>
      )}
    </Show>
    </box>
  )
}
