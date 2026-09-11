/**
 * Compatibility adapter for OpenCode 1.18.30.
 * The public plugin API exposes session history, not the composer selection.
 * LocalProvider supplies the reactive model.current() used by the prompt.
 * Find that context on the mounted slot's Solid owner; never guess from history
 * or model.json (recent models are shared across terminals, not current choices).
 * Upstream: packages/tui/src/context/{local,helper}.tsx at v1.18.30.
 */
export interface CurrentModel {
  providerID: string
  id: string
}

export interface OwnerContext {
  context: object | null
  owner: OwnerContext | null
}

type LocalContext = {
  model: { current: () => unknown; parsed: () => unknown }
  agent: { current: () => unknown }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function isLocalContext(value: unknown): value is LocalContext {
  return isRecord(value) && isRecord(value.model) && isRecord(value.agent)
    && typeof value.model.current === 'function'
    && typeof value.model.parsed === 'function'
    && typeof value.agent.current === 'function'
}

export function selectedModelReader(owner: OwnerContext | null): () => CurrentModel | undefined {
  let local: LocalContext | undefined
  for (let cursor = owner; cursor && !local; cursor = cursor.owner) {
    if (!cursor.context) continue
    for (const key of Reflect.ownKeys(cursor.context)) {
      const value: unknown = Reflect.get(cursor.context, key)
      if (isLocalContext(value)) {
        local = value
        break
      }
    }
  }
  return () => {
    // Keep this call inside a reactive expression so model/agent switches update
    // immediately, even before a new message has been sent.
    const model = local?.model.current()
    if (!isRecord(model)) return undefined
    if (typeof model.providerID !== 'string' || typeof model.modelID !== 'string') return undefined
    if (!model.providerID || !model.modelID) return undefined
    return { providerID: model.providerID, id: model.modelID }
  }
}
