// Keep the opening responsive without discarding a slow, successful CMS read.
export function loadWithFallback(load, fallback, {
  timeoutMs = 1600,
  deadlineMs = 12000,
  onUpdate,
  signal,
} = {}) {
  return new Promise((resolve) => {
    const controller = new AbortController()
    let settled = false
    let finished = false
    let fallbackTimer
    let deadlineTimer

    const settle = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const cleanup = () => {
      finished = true
      clearTimeout(fallbackTimer)
      clearTimeout(deadlineTimer)
      signal?.removeEventListener('abort', cancel)
    }
    const cancel = () => {
      cleanup()
      controller.abort()
      settle(fallback)
    }

    if (signal?.aborted) {
      cancel()
      return
    }
    signal?.addEventListener('abort', cancel, { once: true })
    fallbackTimer = setTimeout(() => settle(fallback), timeoutMs)
    deadlineTimer = setTimeout(cancel, deadlineMs)

    Promise.resolve().then(() => {
      if (controller.signal.aborted) return fallback
      return load(controller.signal)
    }).then((value) => {
      if (finished) return
      const isLate = settled
      cleanup()
      if (isLate) onUpdate?.(value)
      else settle(value)
    }).catch(() => {
      if (finished) return
      cleanup()
      settle(fallback)
    })
  })
}
