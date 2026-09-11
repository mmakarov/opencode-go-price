/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { TimeRange } from "./types.ts"
import { usePeakStatus } from "./status.ts"
import { currentModel, outputPrice } from "./goprice.ts"

export interface PeakHomeIndicatorProps {
  theme: TuiThemeCurrent
  ranges: () => TimeRange[]
  api: TuiPluginApi
  sessionID?: string
}

/** Compact indicator: current model output price, hidden for non-Go models. */
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

  return (
    <Show when={model()}>
      {(info) => (
        <box paddingLeft={1} flexShrink={0}>
          <text fg={peak() ? props.theme.warning : props.theme.success}>
            {"\u25CF"} Out ${info().value.toFixed(2)}/1M {peak() ? "PEAK" : "OFF-PEAK"}
          </text>
        </box>
      )}
    </Show>
  )
}
