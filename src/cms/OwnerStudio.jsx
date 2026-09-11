import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Cloud,
  Eye,
  EyeOff,
  ImagePlus,
  LoaderCircle,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  getOwnerSession,
  isCmsConfigured,
  isLocalStudioMode,
  isOwnerSession,
  loadDraft,
  publishDraft,
  saveDraft,
  signInOwner,
  signOutOwner,
  subscribeAuth,
  uploadPortfolioAsset,
} from './client'
import './OwnerStudio.css'
import ProjectMediaEditor from './ProjectMediaEditor'
import { MAX_PROJECT_IMAGES, resolveUpdate, uploadImageBatch } from '../content/projectMedia.js'

const SECTION_ORDER = ['global', 'opening', 'hero', 'work', 'profile', 'capabilities', 'contact']

const LABELS = {
  global: '全局设置',
  opening: '开场动画',
  hero: '首屏 Hero',
  work: '项目作品',
  profile: '个人经历',
  capabilities: '个人优势',
  contact: '联系方式',
  navItems: '导航项目',
  email: '邮箱',
  phone: '电话',
  logoPath: 'Logo 图片',
  contactCtaLabel: '导航联系按钮',
  mobileRoleLines: '移动端身份信息',
  mobileLocationLines: '移动端所在地',
  label: '标签',
  href: '链接',
  brandName: '品牌名称',
  ownerName: '姓名',
  location: '所在地',
  roleLabel: '身份说明',
  metaLeft: '左侧信息',
  metaRight: '右侧信息',
  word: '开场主标题',
  footerLeft: '底部左文案',
  footerRight: '底部右文案',
  videoUrl: '背景视频',
  videoDesktopUrl: '桌面端优化视频',
  videoMobileUrl: '移动端优化视频',
  poster: '视频封面',
  kicker: '眉题',
  titleLines: '主标题',
  support: '辅助文案',
  ctaLabel: '按钮文字',
  ctaHref: '按钮链接',
  metaItems: '首屏信息标签',
  index: '模块编号',
  title: '标题',
  intro: '模块介绍',
  projects: '项目列表',
  carouselInstructions: '画廊辅助说明',
  caseLabel: '案例标签',
  decisionLabel: '产品判断标题',
  resultLabel: '项目结果标题',
  viewLabel: '查看项目文案',
  placeholderViewLabel: '占位项目文案',
  pendingLabel: '整理中标签',
  coverLabel: '封面标签',
  galleryLabel: '详情图片区标签',
  editProjectLabel: '项目编辑按钮',
  number: '项目编号',
  type: '项目类型',
  role: '项目角色',
  period: '时间',
  image: '封面图片',
  thumbnail: '卡片缩略图',
  imageAlt: '封面替代文字',
  imageFit: '图片适配方式',
  fit: '详情图适配方式',
  imageBackground: '图片背景色',
  summary: '项目概述',
  decision: '产品判断',
  result: '项目结果',
  tags: '项目标签',
  placeholder: '占位项目',
  gallery: '详情图片',
  src: '图片地址',
  alt: '图片替代文字',
  mediaType: '素材类型',
  portrait: '人物照片',
  captionName: '照片姓名',
  captionLocation: '照片所在地',
  leadLabel: '身份标签',
  emailLabel: '邮箱标签',
  phoneLabel: '电话标签',
  timelineTitle: '经历标题',
  timelineRange: '经历时间范围',
  statementParts: '核心介绍',
  text: '文字',
  accent: '主题色强调',
  metrics: '项目数据',
  value: '数值',
  experience: '工作经历',
  company: '公司',
  note: '经历说明',
  items: '内容列表',
  en: '英文标题',
  copy: '能力说明',
  evidence: '能力佐证',
  displayLabel: '背景大标题',
  kickerLabel: '联系标签',
  kickerLocation: '联系所在地',
  pretitle: '标题前文案',
  copyLabel: '复制按钮文案',
  copiedLabel: '复制成功文案',
  links: '外部链接',
  copyright: '版权信息',
  id: '稳定 ID',
}

const LONG_TEXT_KEYS = new Set(['intro', 'support', 'summary', 'decision', 'result', 'copy', 'evidence', 'note'])
const MEDIA_KEY_PATTERN = /(^|_)(image|cover|poster|portrait|src|video)(url)?$/i
const MEDIA_KEYS = new Set([
  'logoPath',
  'image',
  'thumbnail',
  'src',
  'poster',
  'videoUrl',
  'videoDesktopUrl',
  'videoMobileUrl',
])

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

function humanize(key) {
  return LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')
}

function itemTitle(item, index) {
  if (!item || typeof item !== 'object') return `第 ${index + 1} 项`
  return item.title || item.label || item.company || item.text || item.id || `第 ${index + 1} 项`
}

function blankFromTemplate(template, collectionKey) {
  if (collectionKey === 'gallery') {
    return { id: `media-${Date.now()}`, label: '新图片', src: '', alt: '', mediaType: 'ui', fit: 'contain' }
  }
  if (collectionKey === 'projects') {
    return {
      id: `project-${Date.now()}`,
      number: '00',
      title: '新项目',
      type: '',
      role: '',
      period: '',
      image: '',
      thumbnail: '',
      imageAlt: '',
      imageFit: 'cover',
      imageBackground: '#121418',
      summary: '',
      decision: '',
      result: '',
      tags: [],
      placeholder: true,
      gallery: [],
    }
  }
  if (template == null) return ''
  if (Array.isArray(template)) return []
  if (typeof template === 'boolean') return false
  if (typeof template === 'number') return 0
  if (typeof template === 'string') return ''
  const next = Object.fromEntries(
    Object.entries(template).map(([key, value]) => [key, blankFromTemplate(value, key)]),
  )
  if ('id' in next) next.id = `item-${Date.now()}`
  return next
}

function moveItem(items, index, direction) {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function PrimitiveField({ fieldKey, value, onChange, onUpload, uploading }) {
  const stringValue = value ?? ''
  const isLong = LONG_TEXT_KEYS.has(fieldKey) || String(stringValue).length > 88
  const isMedia = MEDIA_KEYS.has(fieldKey) || MEDIA_KEY_PATTERN.test(fieldKey)
  const canUpload = isMedia && !/video/i.test(fieldKey)
  const isFit = fieldKey === 'imageFit' || fieldKey === 'fit'
  const inputId = `cms-${fieldKey}-${useId().replaceAll(':', '')}`
  const locked = fieldKey === 'id'

  if (typeof value === 'boolean') {
    return (
      <label className="cms-toggle-field">
        <span>{humanize(fieldKey)}</span>
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      </label>
    )
  }

  return (
    <div className="cms-field">
      <label htmlFor={inputId}>{humanize(fieldKey)}</label>
      {isLong ? (
        <textarea
          id={inputId}
          rows={4}
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : isFit ? (
        <select id={inputId} value={stringValue} onChange={(event) => onChange(event.target.value)}>
          <option value="cover">cover · 铺满并裁切</option>
          <option value="contain">contain · 完整展示</option>
        </select>
      ) : (
        <input
          id={inputId}
          type={typeof value === 'number' ? 'number' : 'text'}
          value={stringValue}
          readOnly={locked}
          aria-describedby={locked ? `${inputId}-hint` : undefined}
          onChange={(event) => onChange(typeof value === 'number' ? Number(event.target.value) : event.target.value)}
        />
      )}
      {locked && (
        <small className="cms-field-hint" id={`${inputId}-hint`}>
          系统稳定 ID，用于排序与定位，不需要修改。
        </small>
      )}
      {canUpload && (
        <label className={`cms-upload ${uploading ? 'is-uploading' : ''}`}>
          {uploading ? <LoaderCircle aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
          <span>{uploading ? '上传中…' : '上传并替换'}</span>
          <input
            type="file"
            accept={/video/i.test(fieldKey) ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/avif'}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                void onUpload(file)
                  .then((url) => onChange(url))
                  .catch(() => {})
              }
              event.target.value = ''
            }}
          />
        </label>
      )}
      {canUpload && (
        <small className="cms-field-hint">
          素材链接上传后即可公开访问，网站页面仍需点击发布才会更新。
        </small>
      )}
    </div>
  )
}

function ValueEditor({ fieldKey, value, onChange, onUpload, onUploadMany, uploading, depth = 0 }) {
  if (Array.isArray(value)) {
    const primitives = value.every((entry) => entry == null || typeof entry !== 'object')
    return (
      <fieldset className="cms-group cms-collection">
        <legend>{humanize(fieldKey)}</legend>
        {value.length === 0 && <p className="cms-empty">暂时没有内容，可添加第一项。</p>}
        {value.map((entry, index) => (
          <div className="cms-array-item" key={entry?.id || `${fieldKey}-${index}`}>
            {primitives ? (
              <input
                aria-label={`${humanize(fieldKey)} ${index + 1}`}
                value={entry ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value
                  onChange((current) => current.map((item, itemIndex) => itemIndex === index ? nextValue : item))
                }}
              />
            ) : (
              <details data-cms-item-id={entry?.id} defaultOpen={value.length <= 2 || index === 0}>
                <summary>{itemTitle(entry, index)}</summary>
                <div className="cms-object-fields">
                  {fieldKey === 'projects' && (
                    <ProjectMediaEditor
                      project={entry}
                      uploading={uploading}
                      onUpload={onUpload}
                      onUploadMany={onUploadMany}
                      onChange={(update) => onChange((current) => current.map((item) => item.id === entry.id ? resolveUpdate(update, item) : item))}
                    />
                  )}
                  {Object.entries(entry).filter(([key]) => fieldKey !== 'projects' || !['image', 'thumbnail', 'gallery'].includes(key)).map(([childKey, childValue]) => (
                    <ValueEditor
                      key={childKey}
                      fieldKey={childKey}
                      value={childValue}
                      depth={depth + 1}
                      uploading={uploading}
                      onUpload={onUpload}
                      onUploadMany={onUploadMany}
                      onChange={(nextValue) => {
                        onChange((current) => current.map((item, itemIndex) => (
                          entry.id ? item.id === entry.id : itemIndex === index
                        ) ? { ...item, [childKey]: resolveUpdate(nextValue, item[childKey]) } : item))
                      }}
                    />
                  ))}
                </div>
              </details>
            )}
            <div className="cms-array-actions" aria-label={`${humanize(fieldKey)}排序操作`}>
              <button type="button" disabled={index === 0} onClick={() => onChange((current) => moveItem(current, index, -1))} aria-label="上移">
                <ArrowUp aria-hidden="true" />
              </button>
              <button type="button" disabled={index === value.length - 1} onClick={() => onChange((current) => moveItem(current, index, 1))} aria-label="下移">
                <ArrowDown aria-hidden="true" />
              </button>
              <button
                className="is-danger"
                type="button"
                disabled={value.length === 1 && !['gallery', 'tags'].includes(fieldKey)}
                onClick={() => onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={value.length === 1 && !['gallery', 'tags'].includes(fieldKey) ? '至少保留一项' : '删除'}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        <button
          className="cms-add-button"
          type="button"
          onClick={() => onChange((current) => [...current, blankFromTemplate(current[0], fieldKey)])}
        >
          <Plus aria-hidden="true" />
          添加{humanize(fieldKey)}
        </button>
      </fieldset>
    )
  }

  if (value && typeof value === 'object') {
    return (
      <fieldset className="cms-group">
        <legend>{humanize(fieldKey)}</legend>
        <div className="cms-object-fields">
          {Object.entries(value).map(([childKey, childValue]) => (
            <ValueEditor
              key={childKey}
              fieldKey={childKey}
              value={childValue}
              depth={depth + 1}
              uploading={uploading}
              onUpload={onUpload}
              onUploadMany={onUploadMany}
              onChange={(nextValue) => onChange((current) => ({ ...current, [childKey]: resolveUpdate(nextValue, current[childKey]) }))}
            />
          ))}
        </div>
      </fieldset>
    )
  }

  return (
    <PrimitiveField
      fieldKey={fieldKey}
      value={value}
      onChange={onChange}
      onUpload={onUpload}
      uploading={uploading}
    />
  )
}

function LoginPanel({ onSignedIn, initialError = '' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(initialError)

  useEffect(() => {
    if (initialError) setError(initialError)
  }, [initialError])

  const submit = async (event) => {
    event.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const result = await signInOwner(email.trim(), password)
      if (!isOwnerSession(result.session)) throw new Error('此账号没有站点所有者权限。')
      onSignedIn(result.session)
    } catch (nextError) {
      setError(nextError.message || '登录失败，请检查账号与密码。')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div className="cms-gate" role="dialog" aria-modal="true" aria-labelledby="cms-login-title">
      <div className="cms-gate__panel">
        <p className="cms-eyebrow">OWNER STUDIO</p>
        <h1 id="cms-login-title">进入内容工作室</h1>
        <p>此入口只供站点所有者使用。公开访客不会看到编辑功能。</p>
        <form onSubmit={submit}>
          <label>
            <span>管理员邮箱</span>
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            <span>密码</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="cms-error" role="alert">{error}</p>}
          <button className="cms-primary-button" type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? <LoaderCircle aria-hidden="true" /> : <Cloud aria-hidden="true" />}
            {status === 'loading' ? '正在验证…' : '安全登录'}
          </button>
        </form>
        <a href="/">返回公开网站</a>
      </div>
    </div>
  )
}

export default function OwnerStudio({ content, revision = 0, onPreviewChange, onPublished, onOwnerStateChange }) {
  const localMode = isLocalStudioMode()
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [draft, setDraft] = useState(() => clone(content))
  const [draftRevision, setDraftRevision] = useState(revision)
  const [draftVersion, setDraftVersion] = useState(0)
  const [selectedSection, setSelectedSection] = useState('hero')
  const [editing, setEditing] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [draftLoadError, setDraftLoadError] = useState('')
  const [draftLoadAttempt, setDraftLoadAttempt] = useState(0)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [targetItemId, setTargetItemId] = useState('')
  const latestDraftRef = useRef(draft)
  const draftRevisionRef = useRef(revision)
  const draftVersionRef = useRef(0)
  const saveTimerRef = useRef(0)
  const saveQueueRef = useRef(Promise.resolve())
  const confirmRef = useRef(null)
  const mountedRef = useRef(true)
  const operationLockRef = useRef(false)
  const allowExitRef = useRef(false)

  const owner = isOwnerSession(session)
  const sections = useMemo(
    () => SECTION_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(draft || {}, key)),
    [draft],
  )

  const persistDraftSnapshot = (snapshot) => {
    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await saveDraft(
          snapshot,
          draftRevisionRef.current,
          draftVersionRef.current,
        )
        draftRevisionRef.current = result.baseRevision
        draftVersionRef.current = result.draftVersion
        if (mountedRef.current) {
          setDraftRevision(result.baseRevision)
          setDraftVersion(result.draftVersion)
        }
        return result
      })
    saveQueueRef.current = task
    return task
  }

  useEffect(() => {
    mountedRef.current = true
    if (!isCmsConfigured() && !localMode) {
      setAuthReady(true)
      return () => { mountedRef.current = false }
    }

    let unsubscribe = () => {}
    getOwnerSession()
      .then((nextSession) => {
        if (mountedRef.current) {
          setSession(nextSession)
          setAuthReady(true)
        }
      })
      .catch((error) => {
        if (mountedRef.current) {
          setMessage(error.message || '无法读取登录状态。')
          setAuthReady(true)
        }
      })

    unsubscribe = subscribeAuth((nextSession, _event, error) => {
      if (error) {
        setMessage(error.message || '登录状态订阅失败。')
        return
      }
      setSession(nextSession)
    })

    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [localMode])

  useEffect(() => {
    onOwnerStateChange?.({ isOwner: owner, editing })
  }, [editing, onOwnerStateChange, owner])

  useEffect(() => {
    const openRequestedEditor = (event) => {
      const section = event.detail?.section
      if (section && SECTION_ORDER.includes(section)) setSelectedSection(section)
      setTargetItemId(event.detail?.itemId || '')
      setEditing(true)
      setPanelOpen(true)
    }

    window.addEventListener('zet:studio-section', openRequestedEditor)
    return () => window.removeEventListener('zet:studio-section', openRequestedEditor)
  }, [])

  useEffect(() => {
    if (!targetItemId || !editing || !panelOpen) return
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll('[data-cms-item-id]'))
        .find((element) => element.dataset.cmsItemId === targetItemId)
      if (!target) return
      target.open = true
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.querySelector('summary')?.focus({ preventScroll: true })
      setTargetItemId('')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editing, panelOpen, selectedSection, targetItemId])

  useEffect(() => {
    if (!owner) {
      setDraftReady(false)
      setDraftLoadError('')
      return undefined
    }
    let cancelled = false
    setDraftReady(false)
    setDraftLoadError('')
    setMessage('')
    setSaveStatus('loading')
    loadDraft(content, revision)
      .then((result) => {
        if (cancelled) return
        const nextContent = clone(result.content || content)
        latestDraftRef.current = nextContent
        setDraft(nextContent)
        const nextRevision = result.baseRevision ?? revision
        const nextDraftVersion = result.draftVersion ?? 0
        draftRevisionRef.current = nextRevision
        draftVersionRef.current = nextDraftVersion
        setDraftRevision(nextRevision)
        setDraftVersion(nextDraftVersion)
        setDirty(Boolean(result.needsBootstrap))
        setSaveStatus('saved')
        setDraftReady(true)
        onPreviewChange(nextContent)
      })
      .catch((error) => {
        if (!cancelled) {
          const nextMessage = error.message || '草稿读取失败。'
          setMessage(nextMessage)
          setDraftLoadError(nextMessage)
          setSaveStatus('error')
        }
      })
    return () => { cancelled = true }
  }, [draftLoadAttempt, owner])

  useEffect(() => {
    if (!owner || !draftReady || !dirty || uploading || publishing || signingOut) return undefined
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(async () => {
      const snapshot = clone(latestDraftRef.current)
      const serialized = JSON.stringify(snapshot)
      setSaveStatus('saving')
      setMessage('')
      try {
        await persistDraftSnapshot(snapshot)
        if (!mountedRef.current) return
        if (JSON.stringify(latestDraftRef.current) === serialized) setDirty(false)
        setSaveStatus('saved')
      } catch (error) {
        if (!mountedRef.current) return
        setSaveStatus('error')
        setMessage(error.message || '草稿保存失败，请重试。')
      }
    }, 900)
    return () => window.clearTimeout(saveTimerRef.current)
  }, [draft, draftReady, dirty, owner, publishing, signingOut, uploading])

  useEffect(() => {
    const protect = (event) => {
      if (allowExitRef.current) return
      if (!dirty && saveStatus !== 'saving' && !uploading && !publishing && !signingOut) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty, publishing, saveStatus, signingOut, uploading])

  useEffect(() => {
    if (!confirmPublish) return undefined
    const previousFocus = document.activeElement
    const dialog = confirmRef.current
    const focusable = () => Array.from(dialog?.querySelectorAll('button:not([disabled])') || [])
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setConfirmPublish(false)
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const frame = window.requestAnimationFrame(() => focusable().at(-1)?.focus())
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [confirmPublish])

  const changeSection = (nextSection) => {
    if (operationLockRef.current || !draftReady) return
    const current = latestDraftRef.current
    const next = { ...current, [selectedSection]: resolveUpdate(nextSection, current[selectedSection]) }
    latestDraftRef.current = next
    setDraft(next)
    setDirty(true)
    onPreviewChange(next)
  }

  const handleUpload = async (file) => {
    if (operationLockRef.current || !draftReady) {
      throw new Error('当前操作尚未完成，请稍后再试。')
    }
    operationLockRef.current = true
    const uploadSection = selectedSection
    setUploading(true)
    setMessage('')
    try {
      const uploaded = await uploadPortfolioAsset(file, uploadSection)
      return uploaded.publicUrl
    } catch (error) {
      setMessage(error.message || '文件上传失败。')
      throw error
    } finally {
      operationLockRef.current = false
      setUploading(false)
    }
  }

  const handleUploadMany = async (files) => {
    if (operationLockRef.current || !draftReady) throw new Error('当前操作尚未完成，请稍后再试。')
    if (!files.length || files.length > MAX_PROJECT_IMAGES) throw new Error(`一次最多上传 ${MAX_PROJECT_IMAGES} 张缩略图。`)
    operationLockRef.current = true
    const uploadSection = selectedSection
    setUploading(true)
    setMessage('')
    try {
      return await uploadImageBatch(files, async (file) => {
        const uploaded = await uploadPortfolioAsset(file, `${uploadSection}/gallery`)
        return uploaded.publicUrl
      })
    } finally {
      operationLockRef.current = false
      setUploading(false)
    }
  }

  const publish = async () => {
    if (operationLockRef.current || !draftReady) return
    operationLockRef.current = true
    window.clearTimeout(saveTimerRef.current)
    setConfirmPublish(false)
    setPublishing(true)
    setSaveStatus('saving')
    setMessage('')
    const snapshot = clone(latestDraftRef.current)
    const serializedSnapshot = JSON.stringify(snapshot)
    try {
      const saved = await persistDraftSnapshot(snapshot)
      const published = await publishDraft(saved.baseRevision, saved.draftVersion)
      draftRevisionRef.current = published.revision
      draftVersionRef.current = published.draft_version
      setDraftRevision(published.revision)
      setDraftVersion(published.draft_version)
      const unchanged = JSON.stringify(latestDraftRef.current) === serializedSnapshot
      if (unchanged) {
        setDirty(false)
        setSaveStatus('published')
        onPublished?.(published.content || snapshot, published.revision)
      } else {
        setDirty(true)
        setSaveStatus('idle')
        setMessage('已发布上一状态，正在保存发布期间产生的新修改。')
      }
    } catch (error) {
      setSaveStatus('error')
      setMessage(error.message || '发布失败，请重试。')
    } finally {
      operationLockRef.current = false
      setPublishing(false)
    }
  }

  const handleSignOut = async () => {
    if (operationLockRef.current || !draftReady) return
    operationLockRef.current = true
    window.clearTimeout(saveTimerRef.current)
    setSigningOut(true)
    setMessage('')
    try {
      if (dirty || saveStatus === 'saving') {
        setSaveStatus('saving')
        await persistDraftSnapshot(clone(latestDraftRef.current))
        setDirty(false)
        setSaveStatus('saved')
      } else {
        await saveQueueRef.current.catch((error) => { throw error })
      }
      await signOutOwner()
      // The draft queue has finished and sign-out succeeded. Do not let our
      // own beforeunload guard block this intentional, safe navigation.
      allowExitRef.current = true
      window.location.assign(`/${window.location.hash || '#top'}`)
    } catch (error) {
      allowExitRef.current = false
      setSaveStatus('error')
      setMessage(error.message || '草稿尚未安全保存，已取消退出。')
      setEditing(true)
      setPanelOpen(true)
    } finally {
      operationLockRef.current = false
      setSigningOut(false)
    }
  }

  if (!authReady) {
    return <div className="cms-loading"><LoaderCircle aria-hidden="true" /><span>正在连接内容工作室…</span></div>
  }

  if (!isCmsConfigured() && !localMode) {
    return (
      <div className="cms-gate" role="dialog" aria-modal="true" aria-labelledby="cms-setup-title">
        <div className="cms-gate__panel">
          <p className="cms-eyebrow">OWNER STUDIO</p>
          <h1 id="cms-setup-title">后台代码已经就绪</h1>
          <p>请先配置 Supabase 项目地址和 Publishable Key，再创建唯一的管理员账号。公开页面仍会继续使用当前本地内容。</p>
          <code>VITE_SUPABASE_URL<br />VITE_SUPABASE_PUBLISHABLE_KEY</code>
          <a href="/">返回公开网站</a>
        </div>
      </div>
    )
  }

  if (!session) return <LoginPanel onSignedIn={setSession} initialError={message} />

  if (!owner) {
    return (
      <div className="cms-gate" role="dialog" aria-modal="true" aria-labelledby="cms-denied-title">
        <div className="cms-gate__panel">
          <p className="cms-eyebrow">ACCESS DENIED</p>
          <h1 id="cms-denied-title">此账号没有编辑权限</h1>
          <p>登录成功不代表拥有站点管理权；数据库仍会拒绝任何写入请求。</p>
          <button className="cms-primary-button" type="button" onClick={() => signOutOwner()}><LogOut aria-hidden="true" />退出账号</button>
        </div>
      </div>
    )
  }

  if (!draftReady) {
    if (draftLoadError) {
      return (
        <div className="cms-gate" role="dialog" aria-modal="true" aria-labelledby="cms-draft-error-title">
          <div className="cms-gate__panel">
            <p className="cms-eyebrow">DRAFT UNAVAILABLE</p>
            <h1 id="cms-draft-error-title">草稿暂时无法读取</h1>
            <p>{draftLoadError}</p>
            <button
              className="cms-primary-button"
              type="button"
              onClick={() => setDraftLoadAttempt((attempt) => attempt + 1)}
            >
              重新加载
            </button>
            <button type="button" onClick={() => signOutOwner()}>退出账号</button>
          </div>
        </div>
      )
    }
    return <div className="cms-loading"><LoaderCircle aria-hidden="true" /><span>正在读取站点草稿…</span></div>
  }

  const interactionLocked = uploading || publishing || signingOut

  const statusText = {
    loading: '正在读取草稿…',
    saving: '正在保存…',
    saved: dirty ? '等待保存…' : '草稿已保存',
    published: '已发布',
    error: '保存失败',
    idle: dirty ? '有未保存修改' : '内容已同步',
  }[saveStatus]

  return (
    <div className={`cms-studio ${editing ? 'is-editing' : 'is-previewing'}`}>
      <div className="cms-dock" role="toolbar" aria-label="站点编辑工具栏">
        <div className="cms-dock__brand">
          <span>ZET</span>
          <small>{localMode ? 'LOCAL STUDIO · 仅本机' : 'OWNER STUDIO'}</small>
        </div>
        <button type="button" disabled={interactionLocked} aria-pressed={!editing} className={editing ? 'is-active' : ''} onClick={() => setEditing((value) => !value)}>
          {editing ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {editing ? '预览网站' : '继续编辑'}
        </button>
        <span
          className={`cms-save-state is-${saveStatus}`}
          title={`发布版本 ${draftRevision} · 草稿版本 ${draftVersion}`}
          aria-live="polite"
        >
          {saveStatus === 'saving' || signingOut ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
          {signingOut ? '保存并退出…' : statusText}
        </span>
        <button type="button" disabled={interactionLocked} onClick={() => {
          setPanelOpen((value) => editing ? !value : true)
          setEditing(true)
        }} aria-expanded={editing && panelOpen}>
          {panelOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
          内容面板
        </button>
        <button className="cms-publish-button" type="button" onClick={() => setConfirmPublish(true)} disabled={saveStatus === 'saving' || interactionLocked}>
          <Send aria-hidden="true" />发布
        </button>
        <button type="button" disabled={interactionLocked} onClick={handleSignOut} aria-label="保存草稿并退出编辑" title="保存草稿并返回公开网站，不会自动发布"><LogOut aria-hidden="true" />{signingOut ? '退出中…' : '保存并退出'}</button>
      </div>

      {editing && panelOpen && (
        <aside className="cms-inspector" aria-label="内容编辑面板">
          <header>
            <div><p className="cms-eyebrow">CONTENT INSPECTOR</p><h2>{humanize(selectedSection)}</h2></div>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="关闭内容面板"><X aria-hidden="true" /></button>
          </header>
          <nav aria-label="可编辑模块">
            {sections.map((section) => (
              <button
                type="button"
                className={selectedSection === section ? 'is-active' : ''}
                disabled={interactionLocked}
                key={section}
                onClick={() => setSelectedSection(section)}
              >
                {humanize(section)}
              </button>
            ))}
          </nav>
          {message && <p className="cms-error" role="alert">{message}</p>}
          <div className="cms-inspector__body" aria-busy={interactionLocked}>
            <fieldset className="cms-inspector__editor" disabled={interactionLocked}>
              {draft?.[selectedSection] && (
                <ValueEditor
                  fieldKey={selectedSection}
                  value={draft[selectedSection]}
                  uploading={uploading}
                  onChange={changeSection}
                  onUpload={handleUpload}
                  onUploadMany={handleUploadMany}
                />
              )}
            </fieldset>
          </div>
        </aside>
      )}

      {confirmPublish && (
        <div ref={confirmRef} className="cms-confirm" role="dialog" aria-modal="true" aria-labelledby="cms-publish-title">
          <div>
            <p className="cms-eyebrow">PUBLISH</p>
            <h2 id="cms-publish-title">发布当前整站草稿？</h2>
            <p>
              {localMode
                ? '这会更新当前浏览器中的本机公开预览。正式上线前仍需连接 Supabase，线上访客无法进入本机编辑模式。'
                : '发布后普通访客将看到这次修改。系统会保存上一版内容用于后续回滚。'}
            </p>
            <div>
              <button type="button" onClick={() => setConfirmPublish(false)}>取消</button>
              <button className="cms-primary-button" type="button" onClick={publish}><Send aria-hidden="true" />确认发布</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
