import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

/**
 * Output prices in USD per 1M tokens for OpenCode Go models.
 * DeepSeek applies a time-based peak rate (about 2x off-peak) on the
 * weekdays configured through /dspeak; other models use a flat rate.
 */
export interface OutputPrice {
  off: number
  peak?: number
}

export const GO_OUTPUT_PRICES: Record<string, OutputPrice> = {
  "deepseek-v4-flash": { off: 0.6, peak: 1.2 },
  "deepseek-v4.1-flash": { off: 0.6, peak: 1.2 },
  "deepseek-v4-flash-vision-exp": { off: 0.6, peak: 1.2 },
  "deepseek-v4-pro": { off: 1.98, peak: 3.96 },
  "glm-5.3-flash": { off: 0.5 },
  "glm-5.3": { off: 4.4 },
  "glm-5.2": { off: 4.4 },
  "glm-5.1": { off: 4.4 },
  "kimi-k3": { off: 15.0 },
  "kimi-k2.7-code": { off: 4.0 },
  "kimi-k2.6": { off: 4.0 },
  "longcat-2.0": { off: 1.2 },
  "mimo-v2.5": { off: 0.28 },
  "mimo-v2.5-pro": { off: 0.87 },
  "minimax-m3": { off: 1.2 },
  "minimax-m2.7": { off: 1.2 },
  "muse-spark-1.3-contributor": { off: 0.2 },
  "muse-spark-1.2-contributor": { off: 0.2 },
  "qwen3.8-max": { off: 6.0 },
  "qwen3.8-flash": { off: 0.47 },
  "qwen3.7-max": { off: 7.5 },
  "qwen3.7-plus": { off: 1.6 },
  "qwen3.6-plus": { off: 3.0 },
  "hy4-preview": { off: 2.501 },
  "hy3": { off: 0.58 },
  "grok-4.6": { off: 6.0 },
  "gpt-5.6-luna": { off: 1.2 },
}

const ALIASES: Record<string, string> = {
  "deepseek-flash": "deepseek-v4-flash",
  "deepseek-v4.1-flash": "deepseek-v4.1-flash",
}

export function normalizeModelId(id: string): string {
  let key = (id || "").toLowerCase()
  if (key.includes("/")) key = key.split("/").pop() as string
  if (key.endsWith("-free")) key = key.slice(0, -"-free".length)
  return ALIASES[key] ?? key
}

export function outputPrice(modelId: string, peak: boolean): number | undefined {
  const price = GO_OUTPUT_PRICES[normalizeModelId(modelId)]
  if (!price) return undefined
  return peak && price.peak !== undefined ? price.peak : price.off
}

export interface CurrentModel {
  providerID: string
  id: string
}

/** Resolve the model selected for a session, falling back to the config default. */
export function currentModel(api: TuiPluginApi, sessionID?: string): CurrentModel | undefined {  try {
    const session = (api.state.session as { get?: (id: string) => unknown } | undefined)?.get?.(sessionID ?? "")
    const model = (session as { model?: unknown } | undefined)?.model as
      | { id?: string; modelID?: string; providerID?: string }
      | string
      | undefined
    if (model && typeof model === "object" && model.providerID) {
      const id = model.id ?? model.modelID
      if (id) return { providerID: model.providerID, id }
    }
    if (typeof model === "string" && model.includes("/")) {
      const [providerID, id] = model.split("/")
      return { providerID, id }
    }
  } catch {
    // fall through
  }
  try {
    const session = api.state.session as { messages?: (id: string) => unknown[] }
    const messages = session.messages?.(sessionID ?? "") ?? []
    const pick = (value: unknown): CurrentModel | undefined => {
      if (!value || typeof value !== "object") return undefined
      const obj = value as Record<string, unknown>
      const info = obj.info as Record<string, unknown> | undefined
      const nested = [obj, info, obj.model, info?.model]
      for (const candidate of nested) {
        if (!candidate || typeof candidate !== "object") continue
        const record = candidate as Record<string, unknown>
        const providerID = record.providerID
        const id = record.id ?? record.modelID
        if (typeof providerID === "string" && typeof id === "string") return { providerID, id }
      }
      return undefined
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const found = pick(messages[i])
      if (found) return found
    }
  } catch {
    // fall through
  }
  try {
    const fallback = (api.state.config as { model?: unknown } | undefined)?.model
    if (typeof fallback === "string" && fallback.includes("/")) {
      const [providerID, id] = fallback.split("/")
      return { providerID, id }
    }
  } catch {
    // ignore
  }
  return undefined
}
