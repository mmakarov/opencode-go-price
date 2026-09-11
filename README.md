# opencode-go-price

An [OpenCode](https://opencode.ai) TUI plugin that shows the **current model's
output price** and the **DeepSeek peak / off-peak windows** right in the
interface.

It is forked from [`ds-peak-warningx`](https://github.com/Bashar-AlGhada/opencode-ds-peak-warning)
by [Bashar](https://github.com/Bashar-AlGhada) (MIT) and adds the per-model
output price.

![Example](assets/example.svg)

## Features

- Output price of the **currently selected OpenCode Go model**, e.g. `● Output $1.20/1M · PEAK`.
- DeepSeek peak / off-peak status, next switch and countdown.
- Local time taken from the machine's timezone (`Intl`), so "Next" is shown in
  your own timezone.
- Hidden automatically when the active model is **not** served by `opencode-go`
  (or has no known price).
- Peak windows are editable in-app with `/dspeak` and persist across restarts.

## Install

**From a local clone** (works today): clone this repo and point your TUI config
(`~/.config/opencode/tui.json`) at the entry file.

```bash
git clone https://github.com/mmakarov/opencode-go-price
```

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["/absolute/path/to/opencode-go-price/src/index.tsx"]
}
```

**By package name** (after it is published to npm):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-go-price"]
}
```

Restart OpenCode. The indicator appears next to the session prompt; the panel
appears in the sidebar when it is visible (`ctrl+x b`).

## Peak windows

Default DeepSeek schedule (UTC): `01:00-04:00` and `06:00-10:00`, Monday to
Friday; weekends are fully off-peak. Run `/dspeak` to edit or reset, e.g.
`06:00-10:00 Mon-Fri`.

## Price table

Output prices (USD per 1M tokens) live in `src/goprice.ts`. They are a static
table based on the OpenCode Go pricing page; update them there when prices
change. DeepSeek applies a peak multiplier (about 2x off-peak).

## Attribution

Based on [`ds-peak-warningx`](https://github.com/Bashar-AlGhada/opencode-ds-peak-warning)
by Bashar, MIT licensed. See `LICENSE`.

## License

MIT
