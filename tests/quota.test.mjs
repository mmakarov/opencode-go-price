import assert from 'node:assert/strict'
import test from 'node:test'
import { createQuotaStore, QuotaAuthError, fetchGoQuota } from '../src/quota.ts'

const HTML = 'prefix rollingUsage: {"usagePercent":10,"resetInSec":3600} suffix'
const ENV = { OPENCODE_GO_WORKSPACE_ID: 'wrk_test123', OPENCODE_GO_AUTH_COOKIE: 'Fe26.2**cookie-value' }

async function withFetch(handler, fn) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return handler(calls.length)
  }
  try {
    return await fn(calls)
  } finally {
    globalThis.fetch = original
  }
}

test('ensure() is lazy and non-reentrant', async () => {
  const saved = { ...process.env }
  Object.assign(process.env, ENV)
  try {
    await withFetch(
      async () => new Response(HTML, { status: 200 }),
      async (calls) => {
        const store = createQuotaStore(60_000, 5_000)
        assert.equal(calls.length, 0, 'no request before ensure()')
        store.ensure()
        store.ensure()
        await new Promise((resolve) => setTimeout(resolve, 25))
        assert.equal(calls.length, 1, 'idempotent, single in-flight request')
        assert.equal(store.quota()?.rollingPercentRemaining, 90)
        store.dispose()
      },
    )
  } finally {
    for (const key of Object.keys(ENV)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})

test('auth failure clears the previously shown quota', async () => {
  const saved = { ...process.env }
  Object.assign(process.env, ENV)
  try {
    await withFetch(
      async (call) => (call === 1 ? new Response(HTML, { status: 200 }) : new Response('nope', { status: 401 })),
      async (calls) => {
        const store = createQuotaStore(20, 5_000)
        store.ensure()
        await new Promise((resolve) => setTimeout(resolve, 10))
        assert.equal(store.quota()?.rollingPercentRemaining, 90)
        await new Promise((resolve) => setTimeout(resolve, 40))
        assert.ok(calls.length >= 2, 'periodic refresh ran')
        assert.equal(store.quota(), undefined, 'expired cookie drops the value')
        store.dispose()
      },
    )
  } finally {
    for (const key of Object.keys(ENV)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})

test('fetchGoQuota throws QuotaAuthError on 401 and skips without credentials', async () => {
  const saved = { ...process.env }
  try {
    for (const key of Object.keys(ENV)) delete process.env[key]
    assert.equal(await fetchGoQuota(), undefined, 'unconfigured is a no-op')
    Object.assign(process.env, ENV)
    await withFetch(
      async () => new Response('nope', { status: 403 }),
      async () => {
        await assert.rejects(() => fetchGoQuota(), QuotaAuthError)
      },
    )
  } finally {
    for (const key of Object.keys(ENV)) delete process.env[key]
    Object.assign(process.env, saved)
  }
})
