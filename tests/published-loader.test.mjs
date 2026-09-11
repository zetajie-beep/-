import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWithFallback } from '../src/cms/publishedLoader.js'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const fallback = { revision: 0 }

test('fast published reads return once without a second update', async () => {
  const updates = []
  const result = await loadWithFallback(() => ({ revision: 3 }), fallback, { onUpdate: value => updates.push(value) })
  assert.equal(result.revision, 3)
  assert.deepEqual(updates, [])
})

test('slow published reads replace the fallback instead of silently losing new content', async () => {
  const request = deferred()
  const updates = []
  const first = await loadWithFallback(() => request.promise, fallback, { timeoutMs: 5, onUpdate: value => updates.push(value) })
  assert.equal(first, fallback)
  request.resolve({ revision: 8 })
  await tick()
  assert.deepEqual(updates, [{ revision: 8 }])
})

test('failed reads keep the portfolio usable', async () => {
  const result = await loadWithFallback(() => Promise.reject(new Error('offline')), fallback)
  assert.equal(result, fallback)
})

test('unmount cancels the read and prevents late changes', async () => {
  const request = deferred()
  const controller = new AbortController()
  const updates = []
  let requestSignal
  const result = loadWithFallback(signal => { requestSignal = signal; return request.promise }, fallback, {
    signal: controller.signal, onUpdate: value => updates.push(value),
  })
  await tick()
  controller.abort()
  assert.equal(await result, fallback)
  assert.equal(requestSignal.aborted, true)
  request.resolve({ revision: 9 })
  await tick()
  assert.deepEqual(updates, [])
})

test('already cancelled reads never start a network request', async () => {
  const controller = new AbortController()
  controller.abort()
  let started = false
  assert.equal(await loadWithFallback(() => { started = true }, fallback, { signal: controller.signal }), fallback)
  assert.equal(started, false)
})

test('a stalled read is aborted at its final deadline', async () => {
  let requestSignal
  const updates = []
  const request = deferred()
  const result = await loadWithFallback(signal => { requestSignal = signal; return request.promise }, fallback, {
    timeoutMs: 50, deadlineMs: 5, onUpdate: value => updates.push(value),
  })
  assert.equal(result, fallback)
  assert.equal(requestSignal.aborted, true)
  request.resolve({ revision: 9 })
  await tick()
  assert.deepEqual(updates, [])
})
