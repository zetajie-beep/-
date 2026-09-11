import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { appendProjectImages, IMAGE_ACCEPT, MAX_PROJECT_IMAGES, setProjectCover } from '../content/projectMedia.js'

function newMedia(src = '', name = '新图片') {
  return { id: `media-${crypto.randomUUID()}`, src, label: name.replace(/\.[^.]+$/, ''), alt: '', mediaType: 'ui', fit: 'contain' }
}

function UploadButton({ label, multiple = false, disabled, onSelect }) {
  return (
    <label className={`cms-upload ${disabled ? 'is-disabled' : ''}`}>
      <ImagePlus aria-hidden="true" /><span>{label}</span>
      <input type="file" accept={IMAGE_ACCEPT} multiple={multiple} disabled={disabled} aria-label={label}
        onChange={(event) => {
          const files = Array.from(event.target.files || [])
          event.target.value = ''
          if (files.length) void onSelect(files)
        }}
      />
    </label>
  )
}

export default function ProjectMediaEditor({ project, onChange, onUpload, onUploadMany, uploading }) {
  const prefix = useId()
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const gallery = project.gallery || []
  const remaining = Math.max(0, MAX_PROJECT_IMAGES - gallery.length)

  const replaceImage = async (file, id) => {
    setError('')
    setFeedback('')
    try {
      const src = await onUpload(file)
      onChange((current) => id
        ? { ...current, gallery: current.gallery.map((media) => media.id === id ? { ...media, src } : media) }
        : setProjectCover(current, src))
      setFeedback(id ? '缩略图已替换，封面保持不变。' : '封面已替换，缩略图保持不变。')
    } catch (nextError) {
      setError(nextError.message || '上传失败，请重试。')
    }
  }

  const addImages = async (files) => {
    setError('')
    setFeedback('')
    if (files.length > remaining) {
      setError(`最多 ${MAX_PROJECT_IMAGES} 张，当前已有 ${gallery.length} 张，还可添加 ${remaining} 张。请重新选择图片。`)
      return
    }
    try {
      const results = await onUploadMany(files)
      const uploaded = results.filter((result) => result.status === 'fulfilled')
      const failed = results.filter((result) => result.status === 'rejected')
      if (uploaded.length) {
        const images = uploaded.map((result) => newMedia(result.value, result.file.name))
        onChange((current) => appendProjectImages(current, images))
        setFeedback(`已添加 ${uploaded.length} 张缩略图，封面保持不变。`)
      }
      if (failed.length) {
        setError(`${failed.length} 张上传失败：${failed.map((result) => `${result.file.name}（${result.reason?.message || '请重试'}）`).join('；')}`)
      }
    } catch (nextError) {
      setError(nextError.message || '上传失败，请重试。')
    }
  }

  const updateMedia = (id, patch) => onChange((current) => ({
    ...current,
    gallery: current.gallery.map((media) => media.id === id ? { ...media, ...patch } : media),
  }))

  const moveMedia = (id, direction) => onChange((current) => {
    const next = [...current.gallery]
    const index = next.findIndex((media) => media.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= next.length) return current
    ;[next[index], next[target]] = [next[target], next[index]]
    return { ...current, gallery: next }
  })

  return (
    <div className="cms-project-media">
      <fieldset className="cms-group cms-project-cover">
        <legend>项目封面 · 1 张</legend>
        <p className="cms-media-help">用于第二屏项目卡片，以及详情打开时的首张大图。</p>
        <div className="cms-cover-preview">
          {project.image ? <img src={project.image} alt="当前项目封面" loading="lazy" /> : <span>暂未设置封面</span>}
        </div>
        <div className="cms-field">
          <label htmlFor={`${prefix}-cover`}>封面图片地址</label>
          <input id={`${prefix}-cover`} value={project.image || ''}
            onChange={(event) => {
              const src = event.target.value
              onChange((current) => setProjectCover(current, src))
            }}
          />
        </div>
        <UploadButton label="上传并替换封面" disabled={uploading} onSelect={([file]) => replaceImage(file)} />
      </fieldset>

      <fieldset className="cms-group cms-project-gallery">
        <legend>项目缩略图 · <span aria-live="polite">{gallery.length} / {MAX_PROJECT_IMAGES}</span></legend>
        <p className="cms-media-help">设计稿、原型图等图片，在详情封面下方横向排列，点击切换大图。封面不占用这 20 张名额。</p>
        <div className="cms-media-toolbar">
          <UploadButton label="批量上传缩略图" multiple disabled={uploading || !remaining} onSelect={addImages} />
          <span className="cms-field-hint">{remaining ? `还可添加 ${remaining} 张` : '已达 20 张上限'}</span>
        </div>
        <p className="cms-field-hint">支持 JPG、PNG、WebP、AVIF，每张不超过 6MB。</p>
        {!gallery.length && <p className="cms-empty">暂无缩略图，可一次选择多张图片上传。</p>}
        {gallery.map((media, index) => (
          <article className="cms-media-item" key={media.id} data-media-id={media.id}>
            <div className="cms-media-item__head">
              <span className="cms-media-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="cms-media-actions">
                <button type="button" disabled={index === 0} onClick={() => moveMedia(media.id, -1)} aria-label={`上移缩略图 ${index + 1}`}><ArrowUp aria-hidden="true" /></button>
                <button type="button" disabled={index === gallery.length - 1} onClick={() => moveMedia(media.id, 1)} aria-label={`下移缩略图 ${index + 1}`}><ArrowDown aria-hidden="true" /></button>
                <button type="button" className="is-danger" onClick={() => onChange((current) => ({ ...current, gallery: current.gallery.filter((item) => item.id !== media.id) }))} aria-label={`删除缩略图 ${index + 1}`}><Trash2 aria-hidden="true" /></button>
              </div>
            </div>
            <div className="cms-media-item__preview">
              {media.src ? <img src={media.src} alt={media.alt || media.label || `缩略图 ${index + 1}`} loading="lazy" /> : <span>等待添加图片</span>}
            </div>
            <div className="cms-field">
              <label htmlFor={`${prefix}-${media.id}-label`}>图片名称</label>
              <input id={`${prefix}-${media.id}-label`} value={media.label || ''} onChange={(event) => updateMedia(media.id, { label: event.target.value })} />
            </div>
            <UploadButton label={`替换缩略图 ${index + 1}`} disabled={uploading} onSelect={([file]) => replaceImage(file, media.id)} />
            <details className="cms-media-settings">
              <summary>图片设置</summary>
              <div className="cms-field">
                <label htmlFor={`${prefix}-${media.id}-src`}>图片地址</label>
                <input id={`${prefix}-${media.id}-src`} value={media.src || ''} onChange={(event) => updateMedia(media.id, { src: event.target.value })} />
              </div>
              <div className="cms-field">
                <label htmlFor={`${prefix}-${media.id}-alt`}>图片说明</label>
                <input id={`${prefix}-${media.id}-alt`} value={media.alt || ''} onChange={(event) => updateMedia(media.id, { alt: event.target.value })} />
              </div>
              <div className="cms-field">
                <label htmlFor={`${prefix}-${media.id}-fit`}>展示方式</label>
                <select id={`${prefix}-${media.id}-fit`} value={media.fit || 'contain'} onChange={(event) => updateMedia(media.id, { fit: event.target.value })}>
                  <option value="contain">完整展示</option><option value="cover">铺满并裁切</option>
                </select>
              </div>
            </details>
          </article>
        ))}
        <button className="cms-add-button" type="button" disabled={!remaining || uploading}
          onClick={() => onChange((current) => appendProjectImages(current, [newMedia()]))}>
          <Plus aria-hidden="true" />添加图片链接
        </button>
      </fieldset>
      {feedback && <p className="cms-media-feedback" role="status">{feedback}</p>}
      {error && <p className="cms-error" role="alert">{error}</p>}
    </div>
  )
}
