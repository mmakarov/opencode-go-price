/** @jsxImportSource @opentui/solid */
import { Show, getOwner } from "solid-js"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { TimeRange } from "./types.ts"
import { usePeakStatus } from "./status.ts"
import { outputPrice } from "./goprice.ts"
import { selectedModelReader } from "./selected-model.ts"
import { type GoQuota } from "./quota.ts"
import { Battery } from "./battery.tsx"

export interface PeakHomeIndicatorProps {
  theme: TuiThemeCurrent
  ranges: () => TimeRange[]
  api: TuiPluginApi
  sessionID?: string
  quota: () => GoQuota | undefined
}

/** Compact indicator: rolling 5h battery, hidden for non-Go models. */
export function PeakHomeIndicator(props: PeakHomeIndicatorProps) {
  const selectedModel = selectedModelReader(getOwner())
  const { status } = usePeakStatus(props.ranges)
  const peak = () => status().peak

  const model = () => {
    void status() // re-evaluate on the status tick
    const current = selectedModel()
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
    <box visible={Boolean(model())} flexShrink={0}>
    <Show when={model()}>
      {(info) => (
        <box flexDirection="row" paddingLeft={1} flexShrink={0}>
          <text fg={peak() ? props.theme.warning : props.theme.success}>{`$${info().value.toFixed(2)}`}</text>
          <text fg={battColor()}>{" \u25CF 5h "}</text>
          <Show when={remaining() !== undefined} fallback={<text fg={battColor()}>{"—"}</text>}>
              <>
                <Battery percent={remaining()!} color={battColor()} theme={props.theme} />
                <text fg={battColor()}>{` ${Math.round(remaining()!)}%`}</text>
              </>
          </Show>
        </box>
      )}
    </Show>
    </box>
  )
}
