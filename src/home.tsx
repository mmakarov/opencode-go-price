/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { TimeRange } from "./types.ts"
import { usePeakStatus } from "./status.ts"
import { currentModel, outputPrice } from "./goprice.ts"
import { battery, type GoQuota } from "./quota.ts"

export interface PeakHomeIndicatorProps {
  theme: TuiThemeCurrent
  ranges: () => TimeRange[]
  api: TuiPluginApi
  sessionID?: string
  quota: () => GoQuota | undefined
}

/** Compact indicator: rolling 5h battery, hidden for non-Go models. */
export function PeakHomeIndicator(props: PeakHomeIndicatorProps) {
  const { status } = usePeakStatus(props.ranges)
  const peak = () => status().peak

  const model = () => {
    void status() // re-evaluate on the status tick
    const current = currentModel(props.api, props.sessionID)
    if (!current || current.providerID !== "opencode-go") return undefined
    const value = outputPrice(current.id, peak())
    if (value === undefined) return undefined
    return { id: current.id, value }
  }

  const remaining = () => props.quota()?.rollingPercentRemaining
  const battColor = () => {
    const value = remaining()
    if (value === undefined) return props.theme.textMuted
    if (value >= 50) return props.theme.success
    if (value >= 20) return props.theme.warning
    return props.theme.error ?? props.theme.warning
  }

  return (
    <Show when={model()}>
      {(info) => (
        <box paddingLeft={1} flexShrink={0}>
          <text fg={battColor()}>
            {"\u25CF "}
            {remaining() === undefined ? `$${info().value.toFixed(2)}/1M` : `${battery(remaining()!, 10)} ${Math.round(remaining()!)}%`}
          </text>
        </box>
      )}
    </Show>
  )
}
