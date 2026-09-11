import test from 'node:test'
import assert from 'node:assert/strict'
import { canUseLocalEditor, isEditorRoute } from '../src/cms/access.js'
import { isOwnerSession } from '../src/cms/client.js'

test('unauthenticated local preview is available only on loopback development servers', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '::1']) {
    assert.equal(canUseLocalEditor({ development: true, hostname }), true)
  }
})

test('production never enables the local authentication bypass, even on loopback', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'portfolio-website-jsbq.vercel.app']) {
    assert.equal(canUseLocalEditor({ development: false, hostname }), false)
  }
})

test('LAN, public domains and lookalike hosts cannot enable the local bypass', () => {
  for (const hostname of ['192.168.1.2', '0.0.0.0', 'portfolio-website-jsbq.vercel.app', 'localhost.example.com', '127.0.0.1.example.com', '']) {
    assert.equal(canUseLocalEditor({ development: true, hostname }), false)
  }
  assert.equal(canUseLocalEditor({ development: 'true', hostname: 'localhost' }), false)
})

test('both online editor URLs are recognized independently of the local bypass', () => {
  for (const location of [
    { pathname: '/', search: '?studio=1' },
    { pathname: '/studio', search: '' },
    { pathname: '/studio/', search: '' },
  ]) {
    assert.equal(isEditorRoute(location), true)
    assert.equal(canUseLocalEditor({ development: false, hostname: 'portfolio-website-jsbq.vercel.app' }), false)
  }
  assert.equal(isEditorRoute({ pathname: '/', search: '?studio=0' }), false)
  assert.equal(isEditorRoute({ pathname: '/studio-test', search: '' }), false)
})

test('anonymous sessions and user-editable metadata do not enable owner controls', () => {
  for (const session of [
    null,
    {},
    { user: {} },
    { user: { role: 'admin' } },
    { user: { user_metadata: { role: 'admin' } } },
    { user: { app_metadata: { role: 'visitor' } } },
  ]) {
    assert.equal(isOwnerSession(session), false)
  }
})

test('owner UI recognizes the server-managed admin claim; RLS still enforces writes', () => {
  assert.equal(isOwnerSession({ user: { app_metadata: { role: 'admin' } } }), true)
})
