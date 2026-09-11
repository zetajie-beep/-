import defaultContent from './defaultContent.js'

export const MAX_PROJECT_IMAGES = 20
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif'

const defaultProjects = new Map(defaultContent.work.projects.map((project) => [project.id, project]))

// A built-in small image is only an optimization of its matching cover.
// User gallery images must never become the card's cover implicitly.
export function getProjectCardImage(project) {
  const original = defaultProjects.get(project.id)
  return original && project.image === original.image ? original.thumbnail || project.image : project.image
}

export function normalizeProjectMedia(project) {
  const original = defaultProjects.get(project.id)
  const legacy = project.thumbnail
  if (!legacy || legacy === original?.thumbnail || legacy === project.image) return project

  const gallery = Array.isArray(project.gallery) ? project.gallery : []
  if (gallery.some((media) => media.src === legacy)) return { ...project, thumbnail: '' }
  let id = `${project.id}-legacy-thumbnail`
  while (gallery.some((media) => media.id === id)) id += '-image'
  // Preserve legacy uploads, even if an old record already exceeds the limit.
  // The editor allows removing extras; saving/publishing validates the limit.
  return {
    ...project,
    thumbnail: '',
    gallery: [...gallery, { id, src: legacy, label: '原缩略图', alt: '', mediaType: 'ui', fit: 'contain' }],
  }
}

export function setProjectCover(project, src) {
  return { ...project, image: src, thumbnail: '' }
}

export function assertProjectMedia(content) {
  for (const project of content.work.projects) {
    if (typeof project.image !== 'string' || !Array.isArray(project.gallery)) {
      throw new Error(`「${project.title || '项目'}」需要单张封面和独立的缩略图列表。`)
    }
    if (project.gallery.length > MAX_PROJECT_IMAGES) {
      throw new Error(`「${project.title || '项目'}」的缩略图最多 ${MAX_PROJECT_IMAGES} 张，请移除多余图片后再保存。`)
    }
  }
}

export function appendProjectImages(project, images) {
  const gallery = project.gallery || []
  if (gallery.length + images.length > MAX_PROJECT_IMAGES) {
    throw new Error(`缩略图最多 ${MAX_PROJECT_IMAGES} 张，当前还可添加 ${Math.max(0, MAX_PROJECT_IMAGES - gallery.length)} 张。`)
  }
  return { ...project, gallery: [...gallery, ...images] }
}

export function resolveUpdate(update, current) {
  return typeof update === 'function' ? update(current) : update
}

// Limit simultaneous uploads and keep selection order, including partial failures.
export async function uploadImageBatch(files, upload) {
  const results = []
  for (let offset = 0; offset < files.length; offset += 3) {
    const batch = files.slice(offset, offset + 3)
    const settled = await Promise.allSettled(batch.map((file) => upload(file)))
    results.push(...settled.map((result, index) => ({ ...result, file: batch[index] })))
  }
  return results
}
