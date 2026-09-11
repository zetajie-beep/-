import { CMS_CONFIG, CMS_ENV_KEYS } from './config.js'
import { canUseLocalEditor } from './access.js'
import { loadWithFallback } from './publishedLoader.js'
import { assertProjectMedia, normalizeProjectMedia } from '../content/projectMedia.js'

const env = import.meta.env ?? {}
const supabaseUrl = String(env[CMS_ENV_KEYS.url] ?? '').trim()
const supabasePublishableKey = String(env[CMS_ENV_KEYS.publishableKey] ?? '').trim()

const LOCAL_STUDIO_KEYS = Object.freeze({
  draft: 'zet-portfolio-local-draft-v1',
  published: 'zet-portfolio-local-published-v1',
})
const LOCAL_OWNER_SESSION = Object.freeze({
  access_token: 'local-development-only',
  user: Object.freeze({
    id: 'local-portfolio-owner',
    email: 'owner@localhost',
    app_metadata: Object.freeze({ role: 'admin', provider: 'local' }),
  }),
})

let clientPromise

export class CmsClientError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined)
    this.name = 'CmsClientError'
    this.code = code
  }
}

function asCmsError(code, message, cause) {
  if (cause instanceof CmsClientError) return cause
  return new CmsClientError(code, message, cause)
}

function isValidSupabaseUrl(value) {
  if (!value) return false

  try {
    const url = new URL(value)
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    return url.protocol === 'https:' || (url.protocol === 'http:' && localHost)
  } catch {
    return false
  }
}

function isSafePublishableKey(value) {
  if (!value || /^sb_secret_/i.test(value)) return false
  const parts = value.split('.')
  if (parts.length !== 3 || !globalThis.atob) return true

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(globalThis.atob(padded))
    return payload?.role !== 'service_role'
  } catch {
    return true
  }
}

export function isLocalStudioMode() {
  return canUseLocalEditor() && !isCmsConfigured()
}

function readLocalStudioRecord(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    console.warn('[CMS] 无法读取本机内容工作室数据。', error)
    return null
  }
}

function writeLocalStudioRecord(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    throw asCmsError('LOCAL_STUDIO_SAVE_FAILED', '本机草稿保存失败，请检查浏览器存储空间。', error)
  }
}

function safeLocalVersion(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

function isAdminSession(session) {
  // This check only controls owner UI. Supabase RLS remains authoritative.
  return session?.user?.app_metadata?.role === 'admin'
}

export function isOwnerSession(session) {
  return isAdminSession(session)
}

function requireConfiguredClient(client) {
  if (!client) {
    throw new CmsClientError(
      'CMS_NOT_CONFIGURED',
      `CMS 未配置，请设置 ${CMS_ENV_KEYS.url} 与 ${CMS_ENV_KEYS.publishableKey}。`,
    )
  }
  return client
}

function assertSerializableContent(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new CmsClientError('INVALID_CONTENT', '草稿内容必须是 JSON 对象。')
  }

  try {
    JSON.stringify(content)
  } catch (error) {
    throw asCmsError('INVALID_CONTENT', '草稿内容必须是可序列化的数据。', error)
  }

  if (!isCompleteContentDocument(content)) {
    throw new CmsClientError('INVALID_CONTENT_SCHEMA', '草稿结构不完整，请刷新后重试。')
  }
  if (!hasValidStableIds(content)) {
    throw new CmsClientError('INVALID_CONTENT_IDS', '列表内容需要保持唯一的系统 ID。')
  }
  try {
    assertProjectMedia(content)
  } catch (error) {
    throw asCmsError('INVALID_PROJECT_MEDIA', error.message, error)
  }
}

function hasValidStableIds(value) {
  if (Array.isArray(value)) {
    const objects = value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    if (objects.length) {
      const ids = objects.map((entry) => entry.id)
      if (ids.some((id) => typeof id !== 'string' || !id.trim())) return false
      if (new Set(ids).size !== ids.length) return false
    }
    return value.every(hasValidStableIds)
  }
  if (value && typeof value === 'object') return Object.values(value).every(hasValidStableIds)
  return true
}

function isCompleteContentDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const objectSections = ['global', 'opening', 'hero', 'work', 'profile', 'capabilities', 'contact']
  if (value.schemaVersion !== 1) return false
  if (!objectSections.every((section) => value[section] && typeof value[section] === 'object' && !Array.isArray(value[section]))) {
    return false
  }

  return Array.isArray(value.global.navItems)
    && Array.isArray(value.hero.titleLines)
    && Array.isArray(value.work.projects)
    && Array.isArray(value.profile.statementParts)
    && Array.isArray(value.profile.metrics)
    && Array.isArray(value.profile.experience)
    && Array.isArray(value.capabilities.items)
    && Array.isArray(value.contact.links)
}

function cloneValue(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function repairWithDefaults(fallback, incoming) {
  if (Array.isArray(fallback)) {
    if (!Array.isArray(incoming)) return { value: cloneValue(fallback), repaired: true }
    if (!fallback.length) return { value: incoming, repaired: false }

    let repaired = false
    const fallbackHasIds = fallback[0] && typeof fallback[0] === 'object' && !Array.isArray(fallback[0]) && 'id' in fallback[0]
    const value = incoming.map((entry) => {
      const matchingFallback = fallbackHasIds && entry && typeof entry === 'object'
        ? fallback.find((candidate) => candidate?.id === entry.id) || fallback[0]
        : fallback[0]
      const next = repairWithDefaults(matchingFallback, entry)
      repaired ||= next.repaired
      return next.value
    })
    if (fallbackHasIds) {
      const seen = new Set()
      value.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return
        const candidate = typeof entry.id === 'string' ? entry.id.trim() : ''
        if (candidate && !seen.has(candidate)) {
          entry.id = candidate
          seen.add(candidate)
          return
        }
        const prefix = String(fallback[0].id || 'item').replace(/-\d+$/, '')
        let nextId = `${prefix}-${index + 1}`
        while (seen.has(nextId)) nextId = `${nextId}-item`
        entry.id = nextId
        seen.add(nextId)
        repaired = true
      })
    }
    return { value, repaired }
  }

  if (fallback && typeof fallback === 'object') {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return { value: cloneValue(fallback), repaired: true }
    }

    let repaired = Object.keys(incoming).some((key) => !(key in fallback))
    const value = {}
    Object.entries(fallback).forEach(([key, fallbackValue]) => {
      const next = repairWithDefaults(fallbackValue, incoming[key])
      if (!(key in incoming) || next.repaired) repaired = true
      value[key] = next.value
    })
    return { value, repaired }
  }

  if (typeof incoming !== typeof fallback || incoming === null) {
    return { value: fallback, repaired: true }
  }

  return { value: incoming, repaired: false }
}

function normalizeContentDocument(value, fallback) {
  const normalized = repairWithDefaults(fallback, value)
  if (!isCompleteContentDocument(normalized.value)) {
    return { content: cloneValue(fallback), needsBootstrap: true }
  }
  const projects = normalized.value.work.projects.map(normalizeProjectMedia)
  const migratedMedia = projects.some((project, index) => project !== normalized.value.work.projects[index])
  normalized.value.work.projects = projects
  return { content: normalized.value, needsBootstrap: normalized.repaired || migratedMedia }
}

export function isCmsConfigured() {
  return isValidSupabaseUrl(supabaseUrl) && isSafePublishableKey(supabasePublishableKey)
}

export async function getCmsClient() {
  if (!isCmsConfigured()) return null

  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: 'zet-portfolio-owner-session',
        },
      }))
      .catch((error) => {
        clientPromise = undefined
        throw asCmsError('CMS_CLIENT_LOAD_FAILED', 'CMS 客户端加载失败。', error)
      })
  }

  return clientPromise
}

export async function loadPublishedContent(defaultContent, { onUpdate, signal } = {}) {
  if (isLocalStudioMode()) {
    const localPublished = readLocalStudioRecord(LOCAL_STUDIO_KEYS.published)
    if (!localPublished?.content) {
      return { content: defaultContent, revision: 0, needsBootstrap: false }
    }
    const normalized = normalizeContentDocument(localPublished.content, defaultContent)
    return {
      content: normalized.content,
      revision: safeLocalVersion(localPublished.revision),
      needsBootstrap: normalized.needsBootstrap,
    }
  }

  if (!isCmsConfigured()) return { content: defaultContent, revision: 0, needsBootstrap: false }

  const fallback = { content: defaultContent, revision: 0, needsBootstrap: false }
  return loadWithFallback(async (requestSignal) => {
    try {
      const client = await getCmsClient()
      if (requestSignal.aborted) return fallback
      const { data, error } = await client
        .from(CMS_CONFIG.published.table)
        .select('content, revision')
        .eq('id', CMS_CONFIG.published.id)
        .abortSignal(requestSignal)
        .maybeSingle()

      if (error) throw error
      const normalized = normalizeContentDocument(data?.content, defaultContent)
      return {
        content: normalized.content,
        revision: Number.isSafeInteger(data?.revision) ? data.revision : 0,
        needsBootstrap: normalized.needsBootstrap,
      }
    } catch (error) {
      if (!requestSignal.aborted) console.warn('[CMS] 暂时无法读取云端发布内容。', error)
      throw error
    }
  }, fallback, { onUpdate, signal })
}

export async function getOwnerSession() {
  if (isLocalStudioMode()) return LOCAL_OWNER_SESSION
  if (!isCmsConfigured()) return null

  const client = await getCmsClient()
  const { data, error } = await client.auth.getSession()

  if (error) {
    throw asCmsError('AUTH_SESSION_FAILED', '无法读取登录状态。', error)
  }

  return data.session
}

/**
 * Subscribes to owner authentication changes.
 * The listener receives `(session, event)`. The UI may inspect the admin claim,
 * while RLS still enforces every protected operation on the server.
 */
export function subscribeAuth(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('subscribeAuth 需要一个回调函数。')
  }

  let disposed = false
  let subscription

  if (isLocalStudioMode()) {
    queueMicrotask(() => {
      if (!disposed) listener(LOCAL_OWNER_SESSION, 'LOCAL_STUDIO')
    })
    return () => {
      disposed = true
    }
  }

  if (!isCmsConfigured()) {
    queueMicrotask(() => {
      if (!disposed) listener(null, 'CMS_NOT_CONFIGURED')
    })
    return () => {
      disposed = true
    }
  }

  void getCmsClient()
    .then((client) => {
      if (disposed) return

      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!disposed) listener(session, event)
      })
      subscription = data.subscription
    })
    .catch((error) => {
      console.error('[CMS] 登录状态订阅失败。', error)
      if (!disposed) listener(null, 'AUTH_SUBSCRIPTION_ERROR', error)
    })

  return () => {
    disposed = true
    subscription?.unsubscribe()
  }
}

function normalizeCredentials(emailOrOptions, password) {
  if (typeof emailOrOptions === 'string') {
    return { email: emailOrOptions.trim(), password }
  }

  return {
    email: String(emailOrOptions?.email ?? '').trim(),
    password: emailOrOptions?.password,
    redirectTo: emailOrOptions?.redirectTo,
  }
}

export async function signInOwner(emailOrOptions, password) {
  if (isLocalStudioMode()) return { session: LOCAL_OWNER_SESSION, isOwner: true }
  const client = requireConfiguredClient(await getCmsClient())
  const credentials = normalizeCredentials(emailOrOptions, password)

  if (!credentials.email || !/^\S+@\S+\.\S+$/.test(credentials.email)) {
    throw new CmsClientError('INVALID_EMAIL', '请输入有效的邮箱地址。')
  }

  if (credentials.password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })

    if (error) throw asCmsError('OWNER_SIGN_IN_FAILED', '登录失败，请检查邮箱和密码。', error)
    return { ...data, isOwner: isAdminSession(data.session) }
  }

  const redirectTo = credentials.redirectTo
    ?? (typeof window === 'undefined' ? undefined : `${window.location.origin}/?studio=1`)
  const { data, error } = await client.auth.signInWithOtp({
    email: credentials.email,
    options: {
      shouldCreateUser: false,
      ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
    },
  })

  if (error) throw asCmsError('OWNER_SIGN_IN_FAILED', '登录链接发送失败，请稍后重试。', error)
  return { ...data, isOwner: false, magicLinkSent: true }
}

export async function signOutOwner() {
  if (isLocalStudioMode()) return

  const client = await getCmsClient()
  if (!client) return

  const { error } = await client.auth.signOut()
  if (error) throw asCmsError('OWNER_SIGN_OUT_FAILED', '退出登录失败。', error)
}

export async function loadDraft(fallback, currentRevision = null) {
  if (isLocalStudioMode()) {
    const localPublished = readLocalStudioRecord(LOCAL_STUDIO_KEYS.published)
    const localDraft = readLocalStudioRecord(LOCAL_STUDIO_KEYS.draft)
    const source = localDraft?.content || localPublished?.content || fallback
    const normalized = normalizeContentDocument(source, fallback)
    const publishedRevision = safeLocalVersion(localPublished?.revision, safeLocalVersion(currentRevision))
    return {
      content: normalized.content,
      baseRevision: safeLocalVersion(localDraft?.baseRevision, publishedRevision),
      draftVersion: safeLocalVersion(localDraft?.draftVersion),
      updatedAt: localDraft?.updatedAt ?? null,
      needsBootstrap: normalized.needsBootstrap,
    }
  }

  if (!isCmsConfigured()) {
    return { content: fallback, baseRevision: currentRevision, draftVersion: 0, needsBootstrap: false }
  }

  const client = requireConfiguredClient(await getCmsClient())
  const { data, error } = await client
    .from(CMS_CONFIG.drafts.table)
    .select('content, base_revision, draft_version, updated_at')
    .eq('id', CMS_CONFIG.drafts.id)
    .maybeSingle()

  if (error) throw asCmsError('DRAFT_LOAD_FAILED', '草稿加载失败。', error)

  const normalized = normalizeContentDocument(data?.content, fallback)
  return {
    content: normalized.content,
    baseRevision: data?.base_revision ?? currentRevision,
    draftVersion: data?.draft_version ?? 0,
    updatedAt: data?.updated_at ?? null,
    needsBootstrap: normalized.needsBootstrap,
  }
}

export async function saveDraft(content, baseRevision, draftVersion) {
  assertSerializableContent(content)

  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) {
    throw new CmsClientError('INVALID_BASE_REVISION', '草稿基准版本无效。')
  }
  if (!Number.isSafeInteger(draftVersion) || draftVersion < 0) {
    throw new CmsClientError('INVALID_DRAFT_VERSION', '草稿编辑版本无效。')
  }

  if (isLocalStudioMode()) {
    const current = readLocalStudioRecord(LOCAL_STUDIO_KEYS.draft)
    if (current && (
      safeLocalVersion(current.baseRevision) !== baseRevision
      || safeLocalVersion(current.draftVersion) !== draftVersion
    )) {
      throw new CmsClientError('DRAFT_CONFLICT', '草稿已在另一个本机标签页中更新，请刷新后继续编辑。')
    }

    const next = {
      content: cloneValue(content),
      baseRevision,
      draftVersion: draftVersion + 1,
      updatedAt: new Date().toISOString(),
    }
    writeLocalStudioRecord(LOCAL_STUDIO_KEYS.draft, next)
    return next
  }

  const client = requireConfiguredClient(await getCmsClient())

  const { data, error } = await client
    .rpc(CMS_CONFIG.saveRpc, {
      p_content: content,
      p_expected_base_revision: baseRevision,
      p_expected_draft_version: draftVersion,
    })
    .single()

  if (error) {
    const isConflict = error.code === '40001' || /revision|version|conflict|版本/i.test(error.message ?? '')
    throw asCmsError(
      isConflict ? 'DRAFT_CONFLICT' : 'DRAFT_SAVE_FAILED',
      isConflict ? '草稿已在另一个标签页中更新，请刷新后继续编辑。' : '草稿保存失败。',
      error,
    )
  }

  return {
    content: data.content,
    baseRevision: data.base_revision,
    draftVersion: data.draft_version,
    updatedAt: data.updated_at ?? null,
  }
}

export async function publishDraft(baseRevision, draftVersion) {
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 || !Number.isSafeInteger(draftVersion) || draftVersion < 0) {
    throw new CmsClientError('INVALID_PUBLISH_VERSION', '发布版本无效，请刷新草稿后重试。')
  }

  if (isLocalStudioMode()) {
    const draft = readLocalStudioRecord(LOCAL_STUDIO_KEYS.draft)
    if (!draft?.content) throw new CmsClientError('LOCAL_DRAFT_MISSING', '没有可发布的本机草稿。')
    if (
      safeLocalVersion(draft.baseRevision) !== baseRevision
      || safeLocalVersion(draft.draftVersion) !== draftVersion
    ) {
      throw new CmsClientError('PUBLISH_CONFLICT', '本机草稿版本已变化，请刷新后重试。')
    }

    const publishedAt = new Date().toISOString()
    const revision = baseRevision + 1
    const nextDraftVersion = draftVersion + 1
    const content = cloneValue(draft.content)
    assertSerializableContent(content)
    writeLocalStudioRecord(LOCAL_STUDIO_KEYS.published, { content, revision, publishedAt })
    writeLocalStudioRecord(LOCAL_STUDIO_KEYS.draft, {
      content,
      baseRevision: revision,
      draftVersion: nextDraftVersion,
      updatedAt: publishedAt,
    })
    return {
      content,
      revision,
      draft_version: nextDraftVersion,
      published_at: publishedAt,
    }
  }

  const client = requireConfiguredClient(await getCmsClient())
  const { data, error } = await client
    .rpc(CMS_CONFIG.publishRpc, {
      p_expected_base_revision: baseRevision,
      p_expected_draft_version: draftVersion,
    })
    .single()

  if (error) {
    const isConflict = error.code === '40001' || /revision|conflict|版本/i.test(error.message ?? '')
    throw asCmsError(
      isConflict ? 'PUBLISH_CONFLICT' : 'PUBLISH_FAILED',
      isConflict ? '发布版本已变化，请刷新草稿后重试。' : '发布失败，请稍后重试。',
      error,
    )
  }

  return data
}

function sanitizePathSegment(value, fallback) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return normalized || fallback
}

function sanitizeFolder(folder) {
  const segments = String(folder || CMS_CONFIG.storage.defaultFolder)
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .slice(0, 4)
    .map((segment) => sanitizePathSegment(segment, 'assets'))

  return segments.length ? segments.join('/') : CMS_CONFIG.storage.defaultFolder
}

function createSecureId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  if (!globalThis.crypto?.getRandomValues) {
    throw new CmsClientError('SECURE_RANDOM_UNAVAILABLE', '当前环境无法生成安全的上传路径。')
  }

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesMatch(bytes, expected, offset = 0) {
  return expected.every((value, index) => bytes[offset + index] === value)
}

async function hasExpectedFileSignature(file, mimeType) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer())

  if (mimeType === 'image/jpeg') return bytesMatch(bytes, [0xff, 0xd8, 0xff])
  if (mimeType === 'image/png') return bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (mimeType === 'image/webp') {
    return bytesMatch(bytes, [0x52, 0x49, 0x46, 0x46])
      && bytesMatch(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  }
  if (mimeType === 'image/avif') {
    const header = String.fromCharCode(...bytes)
    return header.slice(4, 8) === 'ftyp' && /avif|avis/.test(header.slice(8))
  }

  return false
}

function validateUploadFile(file) {
  if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function') {
    throw new CmsClientError('INVALID_FILE', '请选择有效的图片文件。')
  }
  if (file.size <= 0) throw new CmsClientError('EMPTY_FILE', '不能上传空文件。')
  if (file.size > CMS_CONFIG.storage.maxFileBytes) {
    throw new CmsClientError('FILE_TOO_LARGE', '图片大小不能超过 6MB。')
  }

  const extension = CMS_CONFIG.storage.allowedMimeTypes[file.type]
  if (!extension) {
    throw new CmsClientError('UNSUPPORTED_FILE_TYPE', '仅支持 JPG、PNG、WebP 或 AVIF 图片。')
  }

  return extension
}

export async function uploadPortfolioAsset(file, folder = CMS_CONFIG.storage.defaultFolder) {
  const extension = validateUploadFile(file)
  if (!(await hasExpectedFileSignature(file, file.type))) {
    throw new CmsClientError('FILE_SIGNATURE_MISMATCH', '图片内容与文件类型不一致。')
  }

  const safeFolder = sanitizeFolder(folder)
  const originalStem = String(file.name ?? '').replace(/\.[^.]+$/, '')
  const safeStem = sanitizePathSegment(originalStem, 'image')

  if (isLocalStudioMode()) {
    const query = new URLSearchParams({
      folder: safeFolder,
      name: `${safeStem}.${extension}`,
    })
    const response = await fetch(`/__zet-local-upload?${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-Zet-Local-Studio': '1',
      },
      body: file,
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.publicUrl) {
      throw new CmsClientError('LOCAL_ASSET_UPLOAD_FAILED', result.message || '本机图片保存失败。')
    }
    return result
  }

  const client = requireConfiguredClient(await getCmsClient())
  const date = new Date().toISOString().slice(0, 10)
  const path = `${safeFolder}/${date}/${createSecureId()}-${safeStem}.${extension}`
  const { error } = await client.storage
    .from(CMS_CONFIG.storage.bucket)
    .upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    })

  if (error) throw asCmsError('ASSET_UPLOAD_FAILED', '图片上传失败，请稍后重试。', error)

  const { data } = client.storage.from(CMS_CONFIG.storage.bucket).getPublicUrl(path)
  if (!data?.publicUrl) {
    throw new CmsClientError('ASSET_URL_FAILED', '图片已上传，但无法生成公开地址。')
  }

  return { path, publicUrl: data.publicUrl }
}
