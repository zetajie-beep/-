export const CMS_CONFIG = Object.freeze({
  published: Object.freeze({
    table: 'site_content',
    id: 'published',
  }),
  drafts: Object.freeze({
    table: 'site_drafts',
    id: 'main',
  }),
  saveRpc: 'save_site_draft',
  publishRpc: 'publish_site_content',
  storage: Object.freeze({
    bucket: 'portfolio-assets',
    defaultFolder: 'uploads',
    maxFileBytes: 6 * 1024 * 1024,
    allowedMimeTypes: Object.freeze({
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif',
    }),
  }),
})

export const CMS_ENV_KEYS = Object.freeze({
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
})
