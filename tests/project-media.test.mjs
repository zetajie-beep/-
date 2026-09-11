import test from 'node:test'
import assert from 'node:assert/strict'
import defaultContent from '../src/content/defaultContent.js'
import { appendProjectImages, assertProjectMedia, getProjectCardImage, normalizeProjectMedia, resolveUpdate, setProjectCover, uploadImageBatch } from '../src/content/projectMedia.js'

const project = () => structuredClone(defaultContent.work.projects[0])
const image = (number) => ({ id: `image-${number}`, src: `/design-${number}.png`, label: `设计稿 ${number}` })

test('adding gallery images never changes the cover or card display', () => {
  const original = project()
  const next = appendProjectImages(original, [image(1), image(2)])
  assert.equal(next.image, original.image)
  assert.equal(getProjectCardImage(next), getProjectCardImage(original))
  assert.equal(next.gallery.length, 2)
  assert.deepEqual(original.gallery, [])
})

test('replacing a cover preserves all gallery images and bypasses stale card thumbnails', () => {
  const original = appendProjectImages(project(), [image(1), image(2)])
  const next = setProjectCover(original, '/new-cover.png')
  assert.equal(next.image, '/new-cover.png')
  assert.equal(getProjectCardImage(next), '/new-cover.png')
  assert.deepEqual(next.gallery, original.gallery)
})

test('custom legacy thumbnail is preserved in the existing gallery exactly once', () => {
  const original = { ...project(), thumbnail: '/uploaded-thumbnail.png', gallery: [image(1)] }
  const next = normalizeProjectMedia(original)
  assert.equal(next.image, original.image)
  assert.equal(next.gallery[0].src, '/design-1.png')
  assert.equal(next.gallery[1].src, original.thumbnail)
  assert.equal(next.thumbnail, '')
  assert.deepEqual(normalizeProjectMedia(next), next)
})

test('built-in optimized covers and duplicate legacy uploads are not added as extra images', () => {
  const original = project()
  assert.equal(normalizeProjectMedia(original), original)
  const custom = { ...original, thumbnail: image(1).src, gallery: [image(1)] }
  assert.equal(normalizeProjectMedia(custom).gallery.length, 1)
})

test('20 additional images are allowed, but a 21st image is rejected without mutation', () => {
  const full = appendProjectImages(project(), Array.from({ length: 20 }, (_, index) => image(index)))
  assert.doesNotThrow(() => assertProjectMedia({ work: { projects: [full] } }))
  assert.throws(() => appendProjectImages(full, [image(21)]), /最多 20/)
  assert.equal(full.gallery.length, 20)
  assert.throws(() => assertProjectMedia({ work: { projects: [{ ...full, gallery: [...full.gallery, image(21)] }] } }), /最多 20/)
})

test('legacy records over the limit retain assets and report validation errors', () => {
  const old = { ...project(), thumbnail: '/legacy.png', gallery: Array.from({ length: 20 }, (_, index) => image(index)) }
  const migrated = normalizeProjectMedia(old)
  assert.equal(migrated.gallery.length, 21)
  assert.throws(() => assertProjectMedia({ work: { projects: [migrated] } }), /最多 20/)
})

test('functional changes use the latest project so delayed uploads preserve text edits', () => {
  const latest = { ...project(), title: '修改后的标题' }
  const result = resolveUpdate((current) => appendProjectImages(current, [image(1)]), latest)
  assert.equal(result.title, '修改后的标题')
  assert.equal(result.gallery.length, 1)
})

test('batch upload preserves selection order, successful uploads, and limits concurrency to 3', async () => {
  let active = 0
  let maximum = 0
  const files = Array.from({ length: 7 }, (_, index) => ({ name: `${index}.png`, index }))
  const results = await uploadImageBatch(files, async (file) => {
    maximum = Math.max(maximum, ++active)
    await new Promise((resolve) => setTimeout(resolve, (3 - file.index % 3) * 5))
    active--
    if (file.index === 2) throw new Error('模拟图片校验失败')
    return `/uploaded-${file.index}.png`
  })
  assert.equal(maximum, 3)
  assert.deepEqual(results.map((result) => result.file.index), [0, 1, 2, 3, 4, 5, 6])
  assert.equal(results[2].status, 'rejected')
  assert.equal(results[6].value, '/uploaded-6.png')
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 6)
})
