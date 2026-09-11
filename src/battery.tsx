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

const BLACK = "#000000"
const WHITE = "#ffffff"

/**
 * Phone-style battery bar. The centered label sits on the bar; each label
 * character keeps its segment's background with a contrasting text color.
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
      if (labelIndex >= 0 && labelIndex < label().length) {
        return {
          char: label()[labelIndex],
          fg: isFilled ? BLACK : WHITE,
          bg: segmentColor,
        }
      }
      return {
        char: isFilled ? "\u2588" : "\u2591",
        fg: segmentColor,
        bg: undefined as unknown,
      }
    })

  return (
    <box flexDirection="row">
      {cells().map((cell) => (
        <text fg={cell.fg} bg={cell.bg}>
          {cell.char}
        </text>
      ))}
    </box>
  )
}
