/** @jsxImportSource @opentui/solid */
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"

export interface BatteryProps {
  /** Remaining percent (0-100). */
  percent: number
  /** Color of the filled part (theme token). */
  color: unknown
  theme: TuiThemeCurrent
  width?: number
  label?: string
}

/**
 * Phone-style battery bar. The centered label is drawn in the bar's own color,
 * so the bar stays continuous without a separate label block.
 */
export function Battery(props: BatteryProps) {
  const width = () => props.width ?? 10
  const label = () => props.label ?? "5h"
  const filled = () => Math.round((Math.max(0, Math.min(100, props.percent)) / 100) * width())
  const start = () => Math.max(0, Math.floor((width() - label().length) / 2))
  const cells = () =>
    Array.from({ length: width() }, (_, index) => {
      const isFilled = index < filled()
      const labelIndex = index - start()
      const segmentColor = isFilled ? props.color : props.theme.textMuted
      const isLabel = labelIndex >= 0 && labelIndex < label().length
      return {
        // The label is drawn in the bar's own color so the bar stays continuous.
        char: isLabel ? label()[labelIndex] : isFilled ? "\u2588" : "\u2591",
        fg: segmentColor,
      }
    })

  return (
    <box flexDirection="row">
      {cells().map((cell) => (
        <text fg={cell.fg}>{cell.char}</text>
      ))}
    </box>
  )
}
