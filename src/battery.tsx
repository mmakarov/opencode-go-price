/** @jsxImportSource @opentui/solid */
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"

export interface BatteryProps {
  /** Remaining percent (0-100). */
  percent: number
  /** Color of the filled part (theme token). */
  color: unknown
  theme: TuiThemeCurrent
  width?: number
}

/**
 * Phone-style battery: a solid block bar. The filled part uses `color`, the
 * rest is a dim block, so the bar reads as one continuous segment.
 */
export function Battery(props: BatteryProps) {
  const width = () => props.width ?? 10
  const filled = () => Math.round((Math.max(0, Math.min(100, props.percent)) / 100) * width())
  const cells = () =>
    Array.from({ length: width() }, (_, index) => ({
      char: "\u2588",
      fg: index < filled() ? props.color : props.theme.textMuted,
    }))

  return (
    <box flexDirection="row">
      {cells().map((cell) => (
        <text fg={cell.fg}>{cell.char}</text>
      ))}
    </box>
  )
}
