import assert from 'node:assert/strict'
import test from 'node:test'
import { createComponent, createContext, createMemo, createRoot, createSignal, getOwner } from 'solid-js'
import { selectedModelReader } from '../src/selected-model.ts'
import { outputPrice } from '../src/goprice.ts'

// Same provider/owner arrangement as createSimpleContext in OpenCode v1.18.30.
function mountedSelection(initial) {
  let fixture
  createRoot((dispose) => {
    const Local = createContext()
    const [selected, select] = createSignal(initial)
    const [agent, setAgent] = createSignal('build')
    const local = {
      model: {
        current: createMemo(() => agent() === 'plan'
          ? { providerID: 'openai', modelID: 'gpt-6-astra' } : selected()),
        parsed: () => ({}),
      },
      agent: { current: agent },
    }
    createComponent(Local.Provider, {
      value: local,
      get children() {
        const read = selectedModelReader(getOwner())
        const price = createMemo(() => {
          const model = read()
          return model?.providerID === 'opencode-go' ? outputPrice(model.id, false) : undefined
        })
        fixture = { read, price, select, setAgent, dispose }
        return null
      },
    })
  })
  return fixture
}

test('Go -> OpenAI -> Go updates without a message, clock tick or session write', () => {
  const f = mountedSelection({ providerID: 'opencode-go', modelID: 'deepseek-v4.1-flash' })
  try {
    assert.equal(f.price(), .6)
    f.select({ providerID: 'openai', modelID: 'gpt-6-astra' })
    assert.deepEqual(f.read(), { providerID: 'openai', id: 'gpt-6-astra' })
    assert.equal(f.price(), undefined)
    f.select({ providerID: 'opencode-go', modelID: 'deepseek-v4-pro' })
    assert.equal(f.price(), 1.98)
  } finally { f.dispose() }
})

test('initial OpenAI or missing model can become Go; agent changes also hide Go', () => {
  const f = mountedSelection(undefined)
  try {
    assert.equal(f.price(), undefined)
    f.select({ providerID: 'opencode-go', modelID: 'deepseek-v4-flash' })
    assert.equal(f.price(), .6)
    f.setAgent('plan')
    assert.equal(f.price(), undefined)
    f.setAgent('build')
    assert.equal(f.price(), .6)
  } finally { f.dispose() }
})

test('separate TUI owner trees do not share current selections', () => {
  const a = mountedSelection({ providerID: 'opencode-go', modelID: 'deepseek-v4-flash' })
  const b = mountedSelection({ providerID: 'openai', modelID: 'gpt-6-astra' })
  try {
    a.select({ providerID: 'opencode-go', modelID: 'deepseek-v4-pro' })
    assert.equal(a.price(), 1.98)
    assert.equal(b.price(), undefined)
  } finally { a.dispose(); b.dispose() }
})

test('unknown host context hides the widget instead of using stale history', () => {
  assert.equal(selectedModelReader(null)(), undefined)
  assert.equal(selectedModelReader({ context: { model: 'old-model' }, owner: null })(), undefined)
})
