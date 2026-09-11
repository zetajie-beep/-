import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const maxUploadBytes = 6 * 1024 * 1024
const uploadExtensions = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
])

function safeSegment(value, fallback) {
  const next = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return next || fallback
}

function localStudioUploads() {
  return {
    name: 'zet-local-studio-uploads',
    apply: 'serve',
    configureServer(server) {
      // Newly uploaded files can be requested before Vite's public-file watcher
      // registers them. Serve this directory directly so the first request is
      // an image, never the SPA HTML fallback.
      const localAssetsRoot = path.join(projectRoot, 'public', 'assets', 'local-uploads')
      server.middlewares.use('/assets/local-uploads', async (request, response) => {
        if (!['GET', 'HEAD'].includes(request.method)) {
          response.statusCode = 405
          response.setHeader('Allow', 'GET, HEAD')
          response.end()
          return
        }
        try {
          const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname)
          const filePath = path.resolve(localAssetsRoot, `.${pathname}`)
          const extension = path.extname(filePath).slice(1).toLowerCase()
          const mimeType = [...uploadExtensions].find(([, suffix]) => suffix === extension)?.[0]
          if (!filePath.startsWith(`${localAssetsRoot}${path.sep}`) || !mimeType) {
            response.statusCode = 404
            response.end()
            return
          }
          const bytes = await readFile(filePath)
          response.setHeader('Content-Type', mimeType)
          response.setHeader('Content-Length', bytes.length)
          response.setHeader('X-Content-Type-Options', 'nosniff')
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          response.end(request.method === 'HEAD' ? undefined : bytes)
        } catch {
          response.statusCode = 404
          response.end()
        }
      })
      server.middlewares.use('/__zet-local-upload', async (request, response) => {
        const remoteAddress = request.socket.remoteAddress || ''
        const loopbackRequest = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)
        let localOrigin = true
        try {
          const origin = request.headers.origin ? new URL(request.headers.origin) : null
          localOrigin = !origin || ['localhost', '127.0.0.1', '::1'].includes(origin.hostname)
        } catch {
          localOrigin = false
        }

        if (!loopbackRequest || !localOrigin || request.headers['x-zet-local-studio'] !== '1') {
          response.statusCode = 403
          response.end(JSON.stringify({ message: '本机上传请求无效。' }))
          return
        }
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.setHeader('Allow', 'POST')
          response.end(JSON.stringify({ message: '仅支持 POST 上传。' }))
          return
        }

        const mimeType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
        const extension = uploadExtensions.get(mimeType)
        const declaredSize = Number(request.headers['content-length'] || 0)
        if (!extension || declaredSize <= 0 || declaredSize > maxUploadBytes) {
          response.statusCode = 400
          response.end(JSON.stringify({ message: '仅支持不超过 6MB 的 JPG、PNG、WebP 或 AVIF 图片。' }))
          return
        }

        try {
          const requestUrl = new URL(request.url || '', 'http://127.0.0.1')
          const folder = requestUrl.searchParams.get('folder')
            ?.split('/')
            .filter(Boolean)
            .slice(0, 4)
            .map((segment) => safeSegment(segment, 'assets'))
            .join('/') || 'uploads'
          const fileStem = safeSegment(
            String(requestUrl.searchParams.get('name') || '').replace(/\.[^.]+$/, ''),
            'image',
          )
          const chunks = []
          let received = 0
          for await (const chunk of request) {
            received += chunk.length
            if (received > maxUploadBytes) throw new Error('UPLOAD_TOO_LARGE')
            chunks.push(chunk)
          }
          if (!received) throw new Error('EMPTY_UPLOAD')

          const date = new Date().toISOString().slice(0, 10)
          const relativeDirectory = path.posix.join('assets', 'local-uploads', folder, date)
          const fileName = `${randomUUID()}-${fileStem}.${extension}`
          const absoluteDirectory = path.join(projectRoot, 'public', ...relativeDirectory.split('/'))
          await mkdir(absoluteDirectory, { recursive: true })
          await writeFile(path.join(absoluteDirectory, fileName), Buffer.concat(chunks))

          response.statusCode = 201
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({
            path: path.posix.join(relativeDirectory, fileName),
            publicUrl: `/${path.posix.join(relativeDirectory, fileName)}`,
          }))
        } catch (error) {
          response.statusCode = error?.message === 'UPLOAD_TOO_LARGE' ? 413 : 400
          response.end(JSON.stringify({ message: '本机图片保存失败，请重试。' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localStudioUploads()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
