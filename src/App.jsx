import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Menu,
  Pencil,
  UserRound,
  X,
} from 'lucide-react'
import BorderGlow from './components/BorderGlow'
import defaultSiteContent from './content/defaultContent'
import { loadPublishedContent } from './cms/client'
import { canUseLocalEditor, isEditorRoute } from './cms/access'
import { getProjectCardImage, MAX_PROJECT_IMAGES } from './content/projectMedia'

gsap.registerPlugin(ScrollTrigger)

const Antigravity = lazy(() => import('./components/Antigravity'))
// The online owner route loads the editor lazily; Auth and database RLS gate edits.
const OwnerStudio = lazy(() => import('./cms/OwnerStudio'))

const borderGlowColors = ['#B7F34A', '#E7FFB5', '#73D982']
const projectGlowProps = {
  edgeSensitivity: 30,
  glowColor: '81.3 87.6 62.2',
  backgroundColor: '#0C0E11',
  borderRadius: 0,
  glowRadius: 28,
  glowIntensity: 1,
  coneSpread: 25,
  animated: false,
  colors: borderGlowColors,
  fillOpacity: 0.28,
}

function useScrollState(progressRef) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let frameId = 0

    const update = () => {
      frameId = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress})`
      const nextScrolled = window.scrollY > 24
      setScrolled((current) => (current === nextScrolled ? current : nextScrolled))
    }

    const requestUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
    }
  }, [progressRef])

  return scrolled
}

function useSiteMotion(scopeRef, editorMode = false, contentReady = true) {
  useLayoutEffect(() => {
    const scope = scopeRef.current
    if (!scope || !contentReady) return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const deepLink = editorMode || (window.location.hash && window.location.hash !== '#top')
    const refresh = () => ScrollTrigger.refresh()

    if (motionQuery.matches || editorMode) {
      scope.classList.add('motion-reduced')
      const curtain = scope.querySelector('.opening-curtain')
      if (curtain) curtain.hidden = true
      return () => scope.classList.remove('motion-reduced')
    }

    scope.classList.add('motion-enhanced')

    const context = gsap.context(() => {
      const openingCurtain = scope.querySelector('.opening-curtain')
      const finishOpening = () => {
        document.body.classList.remove('is-opening')
        if (openingCurtain) gsap.set(openingCurtain, { display: 'none' })
      }

      if (deepLink) {
        gsap.set(openingCurtain, { autoAlpha: 0, display: 'none' })
      } else {
        document.body.classList.add('is-opening')
        const opening = gsap.timeline({
          defaults: { ease: 'power4.out' },
          onComplete: finishOpening,
        })

        opening
          .set('.opening-curtain__progress span', { scaleX: 0, transformOrigin: 'left center' })
          .fromTo(
            '.opening-curtain__word span',
            { yPercent: 125, scaleY: 0.68 },
            { yPercent: 0, scaleY: 1, duration: 1.15 },
            0.08,
          )
          .fromTo(
            '.opening-curtain__meta span',
            { y: 24, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, stagger: 0.12 },
            0.2,
          )
          .to('.opening-curtain__progress span', { scaleX: 1, duration: 1.05, ease: 'power2.inOut' }, 0.16)
          .to(
            '.opening-curtain',
            { yPercent: -100, duration: 1.35, ease: 'power4.inOut', onComplete: finishOpening },
            1.2,
          )
          .fromTo('.foldcraft-media', { scale: 1.16 }, { scale: 1, duration: 2.2 }, 0.85)
          .fromTo(
            '.liquid-nav-shell',
            { y: -34, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.15 },
            1.58,
          )
          .fromTo(
            '.hero-title__line',
            { yPercent: 118, scaleY: 0.62 },
            { yPercent: 0, scaleY: 1, duration: 1.3, stagger: 0.14 },
            1.55,
          )
          .fromTo(
            '.hero-kicker',
            { x: -54, opacity: 0 },
            { x: 0, opacity: 1, duration: 1 },
            1.76,
          )
          .fromTo(
            ['.hero-support', '.hero-cta'],
            { y: 42, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.05, stagger: 0.14 },
            2.05,
          )
          .fromTo(
            '.hero-fact',
            { y: 28, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.9, stagger: 0.08 },
            2.18,
          )
      }

      gsap.utils.toArray('.motion-section').forEach((section) => {
        const header = section.querySelector('.section-header')
        if (!header) return
        const display = header.querySelector('.section-display__text')
        const kicker = header.querySelector('.section-kicker')
        const main = header.querySelectorAll('.section-header__main > *')

        gsap
          .timeline({
            scrollTrigger: {
              trigger: header,
              start: 'top 82%',
              once: true,
            },
          })
          .fromTo(
            display,
            { yPercent: 120, xPercent: -7, scaleY: 0.58 },
            { yPercent: 0, xPercent: 0, scaleY: 1, duration: 1.35, ease: 'power4.out' },
          )
          .fromTo(kicker, { x: -72, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9 }, 0.18)
          .fromTo(
            main,
            { y: 64, opacity: 0 },
            { y: 0, opacity: 1, duration: 1, stagger: 0.12 },
            0.34,
          )
      })

      const visibleProjectMedia = scope.querySelectorAll(
        '.project-carousel__set[data-motion-primary-set] .project-carousel__media',
      )
      const visibleProjectBodies = scope.querySelectorAll(
        '.project-carousel__set[data-motion-primary-set] .project-carousel__body',
      )
      const visibleProjectImages = scope.querySelectorAll(
        '.project-carousel__set[data-motion-primary-set] .project-carousel__image-wrap',
      )

      gsap
        .timeline({
          scrollTrigger: {
            trigger: '.project-carousel',
            start: 'top 84%',
            once: true,
          },
        })
        .fromTo(
          visibleProjectMedia,
          { clipPath: 'inset(0 0 100% 0)' },
          { clipPath: 'inset(0 0 0% 0)', duration: 1.15, stagger: 0.08, ease: 'power4.inOut' },
        )
        .fromTo(
          visibleProjectBodies,
          { y: 44, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power4.out' },
          0.18,
        )
        .fromTo(
          '.project-carousel__controls button',
          { y: 24, scale: 0.86, opacity: 0 },
          { y: 0, scale: 1, opacity: 1, duration: 0.72, stagger: 0.1, ease: 'power4.out' },
          0.62,
        )

      gsap.fromTo(
        visibleProjectImages,
        { yPercent: -4 },
        {
          yPercent: 4,
          ease: 'none',
          scrollTrigger: {
            trigger: '.project-carousel',
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.2,
          },
        },
      )

      gsap
        .timeline({
          scrollTrigger: {
            trigger: '.about__grid',
            start: 'top 80%',
            once: true,
          },
        })
        .fromTo(
          '.portrait-frame',
          { clipPath: 'inset(0 100% 0 0)' },
          { clipPath: 'inset(0 0% 0 0)', duration: 0.86, ease: 'power4.inOut' },
        )
        .fromTo(
          '.portrait-frame img',
          { scale: 1.14, xPercent: -3 },
          { scale: 1.08, xPercent: 0, duration: 1.02, ease: 'power4.out' },
          0.04,
        )
        .fromTo(
          '.portrait-geometry--axis-x',
          { scaleX: 0 },
          { scaleX: 1, duration: 0.72, ease: 'power3.inOut' },
          0.06,
        )
        .fromTo(
          '.portrait-geometry--axis-y',
          { scaleY: 0 },
          { scaleY: 1, duration: 0.72, ease: 'power3.inOut' },
          0.1,
        )
        .fromTo(
          [
            '.portrait-geometry--outline',
            '.portrait-geometry--corner',
            '.portrait-geometry--node',
          ],
          { opacity: 0 },
          { opacity: 1, duration: 0.46, stagger: 0.07, ease: 'power2.out' },
          0.24,
        )
        .fromTo(
          ['.about__lead-label', '.about__statement', '.about__summary'],
          { y: 76, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.08, stagger: 0.13 },
          0.22,
        )
        .fromTo(
          '.profile-links button',
          { y: 42, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.9, stagger: 0.1 },
          0.72,
        )

      gsap.fromTo(
        '.portrait-frame img',
        { yPercent: -3 },
        {
          yPercent: 3,
          ease: 'none',
          scrollTrigger: {
            trigger: '.portrait-frame',
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.25,
          },
        },
      )

      gsap.fromTo(
        '.metric',
        { y: 94, opacity: 0, scaleY: 0.82, transformOrigin: 'bottom center' },
        {
          y: 0,
          opacity: 1,
          scaleY: 1,
          duration: 1.08,
          stagger: 0.11,
          ease: 'power4.out',
          scrollTrigger: {
            trigger: '.metric-strip',
            start: 'top 82%',
            once: true,
          },
        },
      )

      gsap
        .timeline({
          scrollTrigger: {
            trigger: '.timeline',
            start: 'top 80%',
            once: true,
          },
        })
        .fromTo('.timeline__heading', { x: -76, opacity: 0 }, { x: 0, opacity: 1, duration: 1 })
        .fromTo(
          '.timeline__item',
          { y: 72, opacity: 0 },
          { y: 0, opacity: 1, duration: 1, stagger: 0.12, ease: 'power4.out' },
          0.18,
        )

      gsap
        .timeline({
          scrollTrigger: {
            trigger: '.capability-grid',
            start: 'top 82%',
            once: true,
          },
        })
        .fromTo(
          '.capability-card',
          { opacity: 0, clipPath: 'inset(100% 0 0 0)' },
          { opacity: 1, clipPath: 'inset(0% 0 0 0)', duration: 1.05, stagger: 0.14, ease: 'power4.inOut' },
        )
        .fromTo(
          '.capability-card__motion',
          { y: 72 },
          { y: 0, duration: 1.05, stagger: 0.14, ease: 'power4.out', clearProps: 'transform' },
          0.18,
        )

      gsap
        .timeline({
          scrollTrigger: {
            trigger: '.contact',
            start: 'top 76%',
            once: true,
          },
        })
        .fromTo(
          '.contact .section-display__text',
          { yPercent: 120, xPercent: -7, scaleY: 0.58 },
          { yPercent: 0, xPercent: 0, scaleY: 1, duration: 1.4, ease: 'power4.out' },
        )
        .fromTo(
          '.contact__kicker span',
          { y: 34, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.85, stagger: 0.12 },
          0.24,
        )
        .fromTo(
          ['.contact__center > p', '.contact__center h2', '.email-row'],
          { y: 84, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.1, stagger: 0.13 },
          0.42,
        )
        .fromTo('.contact__footer', { y: 48, opacity: 0 }, { y: 0, opacity: 1, duration: 0.95 }, 0.94)
    }, scope)

    let disposed = false
    document.fonts?.ready.then(() => {
      if (!disposed) refresh()
    })
    window.addEventListener('load', refresh, { once: true })

    return () => {
      disposed = true
      document.body.classList.remove('is-opening')
      window.removeEventListener('load', refresh)
      context.revert()
      scope.classList.remove('motion-enhanced')
    }
  }, [contentReady, editorMode, scopeRef])
}

function Header({ scrolled, content, showStudio = false }) {
  const navItems = content.navItems || []
  const email = content.email || ''
  const logoMask = content.logoPath ? `url(${JSON.stringify(content.logoPath)})` : undefined
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)
  const firstLinkRef = useRef(null)
  const glassRef = useRef(null)
  const glassFrameRef = useRef(0)
  const glassBoundsRef = useRef(null)
  const glassPointerEnabledRef = useRef(false)

  useEffect(() => {
    const closeOnDesktop = () => {
      if (window.innerWidth >= 768) setOpen(false)
    }
    window.addEventListener('resize', closeOnDesktop)
    return () => window.removeEventListener('resize', closeOnDesktop)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }

    document.body.style.overflow = open ? 'hidden' : previousOverflow
    window.addEventListener('keydown', handleKeyDown)
    if (open) window.requestAnimationFrame(() => firstLinkRef.current?.focus())

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
    const syncPointerMode = () => {
      glassPointerEnabledRef.current = pointerQuery.matches
      glassBoundsRef.current = null
    }
    const clearCachedBounds = () => {
      glassBoundsRef.current = null
    }

    syncPointerMode()
    pointerQuery.addEventListener?.('change', syncPointerMode)
    window.addEventListener('resize', clearCachedBounds)

    return () => {
      window.cancelAnimationFrame(glassFrameRef.current)
      pointerQuery.removeEventListener?.('change', syncPointerMode)
      window.removeEventListener('resize', clearCachedBounds)
    }
  }, [])

  const cacheGlassBounds = (event) => {
    if (!glassPointerEnabledRef.current) return
    glassBoundsRef.current = event.currentTarget.getBoundingClientRect()
  }

  const moveGlassHighlight = (event) => {
    const shell = glassRef.current
    if (!shell || !glassPointerEnabledRef.current) return
    const bounds = glassBoundsRef.current || shell.getBoundingClientRect()
    glassBoundsRef.current = bounds
    const x = ((event.clientX - bounds.left) / bounds.width) * 100
    const y = ((event.clientY - bounds.top) / bounds.height) * 100
    window.cancelAnimationFrame(glassFrameRef.current)
    glassFrameRef.current = window.requestAnimationFrame(() => {
      shell.style.setProperty('--glass-x', `${x.toFixed(2)}%`)
      shell.style.setProperty('--glass-y', `${y.toFixed(2)}%`)
    })
  }

  const resetGlassHighlight = () => {
    window.cancelAnimationFrame(glassFrameRef.current)
    const shell = glassRef.current
    if (!shell) return
    glassBoundsRef.current = null
    shell.style.setProperty('--glass-x', '50%')
    shell.style.setProperty('--glass-y', '0%')
  }

  const closeMenu = () => setOpen(false)

  return (
    <header
      className={`liquid-header fixed inset-x-0 top-0 z-30 font-geist ${
        scrolled && !open ? 'liquid-header--scrolled' : ''
      } ${open ? 'liquid-header--menu-open' : ''}`}
    >
      <div
        ref={glassRef}
        className="liquid-nav-shell relative z-30 mx-auto mt-3 h-16"
        onPointerEnter={cacheGlassBounds}
        onPointerMove={moveGlassHighlight}
        onPointerLeave={resetGlassHighlight}
      >
        <div className="liquid-nav__content px-4 sm:px-5 md:px-8 lg:px-10">
          <span className="liquid-nav__specular" aria-hidden="true" />
          <div className="flex items-center gap-10 lg:gap-14">
            <a
              className="nav-logo-link inline-flex h-11 w-11 items-center justify-center"
              href="#top"
              aria-label="返回首页"
            >
              <span
                className="nav-logo-mark"
                style={logoMask ? { '--logo-mask': logoMask } : undefined}
                aria-hidden="true"
              />
            </a>

            <nav className="hidden items-center gap-7 md:flex lg:gap-9" aria-label="主要导航">
              {navItems.map((item) => (
                <a
                  className="inline-flex min-h-11 items-center text-sm text-white/80 transition-colors hover:text-[#B7F34A]"
                  key={item.href}
                  href={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            {showStudio && (
              <a
                className="nav-studio-link"
                href="/?studio=1"
                aria-label="进入管理员后台"
                title="管理员后台"
              >
                <UserRound aria-hidden="true" />
              </a>
            )}

            <a
              className="accent-button hidden min-h-11 items-center bg-[#B7F34A] px-5 py-2 text-sm font-medium text-black md:inline-flex"
              href={`mailto:${email}`}
            >
              {content.contactCtaLabel}
            </a>

            <button
              ref={toggleRef}
              className="liquid-menu-toggle relative z-50 grid h-10 w-10 cursor-pointer place-items-center text-white transition-transform duration-200 active:scale-90 md:hidden"
              type="button"
              aria-label={open ? '关闭导航' : '打开导航'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((value) => !value)}
            >
              <Menu
                className={`absolute h-6 w-6 transition-all duration-300 ${
                  open ? 'rotate-90 scale-75 opacity-0' : 'rotate-0 scale-100 opacity-100'
                }`}
                aria-hidden="true"
              />
              <X
                className={`absolute h-6 w-6 transition-all duration-300 ${
                  open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-75 opacity-0'
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>

      <div
        id="mobile-menu"
        className={`liquid-mobile-menu fixed inset-x-0 top-0 z-20 overflow-hidden md:hidden ${open ? 'is-open' : ''}`}
        aria-hidden={!open}
      >
        <div
          className={`flex h-full flex-col justify-center px-8 transition-all delay-100 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <nav className="flex flex-col items-start gap-5" aria-label="移动端导航">
            {navItems.map((item, index) => (
              <a
                ref={index === 0 ? firstLinkRef : undefined}
                className="inline-flex min-h-11 items-center gap-4 text-[32px] font-medium tracking-tight text-white/90 transition-colors hover:text-[#B7F34A]"
                key={item.href}
                href={item.href}
                tabIndex={open ? 0 : -1}
                onClick={closeMenu}
              >
                <span className="font-mono text-[11px] font-medium tracking-[0.16em] text-[#B7F34A]">
                  0{index + 1}
                </span>
                {item.label}
              </a>
            ))}
          </nav>
          <a
            className="accent-button mt-6 inline-flex w-fit items-center bg-[#B7F34A] px-8 py-3.5 text-base font-medium text-black"
            href={`mailto:${email}`}
            tabIndex={open ? 0 : -1}
            onClick={closeMenu}
          >
            {content.contactCtaLabel}
          </a>
          <div className="absolute inset-x-8 bottom-8 flex items-end justify-between border-t border-white/10 pt-5 text-xs leading-relaxed text-white/45">
            <span>
              {content.mobileRoleLines.map((line) => <span className="mobile-footer-line" key={line}>{line}</span>)}
            </span>
            <span className="text-right">
              {content.mobileLocationLines.map((line) => <span className="mobile-footer-line" key={line}>{line}</span>)}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

function OpeningCurtain({ content }) {
  return (
    <div className="opening-curtain" aria-hidden="true">
      <div className="opening-curtain__grid" />
      <div className="opening-curtain__meta">
        <span>{content.metaLeft}</span>
        <span>{content.metaRight}</span>
      </div>
      <div className="opening-curtain__word">
        <span>{content.word}</span>
      </div>
      <div className="opening-curtain__footer">
        <span>{content.footerLeft}</span>
        <div className="opening-curtain__progress">
          <span />
        </div>
        <span>{content.footerRight}</span>
      </div>
    </div>
  )
}

function Hero({ content }) {
  const videoRef = useRef(null)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const desktopVideoUrl = content.videoDesktopUrl || content.videoUrl
  const mobileVideoUrl = content.videoMobileUrl || desktopVideoUrl

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    let pageLoaded = document.readyState === 'complete'

    const syncPreference = () => {
      setVideoEnabled(pageLoaded && !mediaQuery.matches && !connection?.saveData)
    }
    const handleLoad = () => {
      pageLoaded = true
      syncPreference()
    }

    syncPreference()
    if (!pageLoaded) window.addEventListener('load', handleLoad, { once: true })
    mediaQuery.addEventListener?.('change', syncPreference)
    connection?.addEventListener?.('change', syncPreference)

    return () => {
      window.removeEventListener('load', handleLoad)
      mediaQuery.removeEventListener?.('change', syncPreference)
      connection?.removeEventListener?.('change', syncPreference)
    }
  }, [])

  useEffect(() => {
    if (!videoEnabled || !videoRef.current) return undefined
    let isVisible = true
    const sync = () => {
      if (!videoRef.current) return
      if (!isVisible) videoRef.current.pause()
      else videoRef.current.play().catch(() => {})
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting
        sync()
      },
      { threshold: 0.05 },
    )

    sync()
    if (videoRef.current) observer.observe(videoRef.current)
    return () => {
      observer.disconnect()
    }
  }, [desktopVideoUrl, mobileVideoUrl, videoEnabled])

  return (
    <section
      className="foldcraft-hero relative h-screen min-h-[680px] w-full overflow-hidden bg-black font-geist"
      id="top"
      aria-labelledby="hero-title"
    >
      <div className="foldcraft-media absolute inset-0" aria-hidden="true">
        <div
          className="foldcraft-fallback absolute inset-0"
          style={content.poster ? { backgroundImage: `url(${JSON.stringify(content.poster)})` } : undefined}
        />
        {videoEnabled && (
          <video
            key={`${mobileVideoUrl}|${desktopVideoUrl}`}
            ref={videoRef}
            className="foldcraft-video absolute inset-0 h-full w-full object-cover object-[70%_center]"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={content.poster || undefined}
          >
            <source
              src={mobileVideoUrl}
              media="(max-width: 680px)"
              type="video/mp4"
            />
            <source
              src={desktopVideoUrl}
              type="video/mp4"
            />
          </video>
        )}
      </div>
      <div className="foldcraft-scrim absolute inset-0" aria-hidden="true" />

      <div className="hero-layout relative z-10 mx-auto mt-20 h-[calc(100vh-80px)] min-h-[600px] w-full max-w-[1700px] px-6 pb-10 pt-12 sm:pb-12 sm:pt-16 md:px-12 md:pb-16 md:pt-20 lg:px-16">
        <div className="hero-copy">
          <p className="hero-kicker">
            {content.kicker}
          </p>
          <h1
            className="hero-title-motion"
            id="hero-title"
          >
            {content.titleLines.map((line, index) => (
              <span className="hero-title__mask" key={`${line}-${index}`}>
                <span className="hero-title__line">{line}</span>
              </span>
            ))}
          </h1>
          <div className="hero-brief">
            <span className="hero-brief__rule" aria-hidden="true" />
            <p className="hero-support">{content.support}</p>
            <a className="accent-button hero-cta" href={content.ctaHref}>
              {content.ctaLabel}
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </div>

        <dl className="hero-facts" aria-label="个人概览">
          {(content.metaItems || []).map((item) => (
            <div className="hero-fact" key={item.id}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function SectionHeader({ index, label, title, intro }) {
  return (
    <div className="section-header">
      <div className="section-display" aria-hidden="true">
        <span className="section-display__text">{label}</span>
      </div>
      <div className="section-kicker">
        <span>{index}</span>
        <span>{label}</span>
      </div>
      <div className="section-header__main">
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </div>
    </div>
  )
}

function About({ content, globalContent }) {
  const email = globalContent.email || ''
  const phone = globalContent.phone || ''
  const [copiedContact, setCopiedContact] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const copyResetRef = useRef(0)

  useEffect(() => () => window.clearTimeout(copyResetRef.current), [])

  const copyProfileContact = async (type, value) => {
    window.clearTimeout(copyResetRef.current)
    try {
      await navigator.clipboard.writeText(value)
      setCopiedContact(type)
      setCopyMessage(type === 'email' ? '邮箱已复制' : '电话已复制')
    } catch {
      setCopiedContact('')
      setCopyMessage('复制失败，请重试')
    }
    copyResetRef.current = window.setTimeout(() => {
      setCopiedContact('')
      setCopyMessage('')
    }, 1800)
  }

  return (
    <section className="about section motion-section" id="about" aria-labelledby="about-title">
      <div className="page-shell">
        <SectionHeader
          index={content.index}
          label={content.label}
          title={<span id="about-title">{content.title}</span>}
          intro={content.intro}
        />

        <div className="about__grid">
          <figure className="portrait-column">
            <div className="portrait-composition">
              <span className="portrait-geometry portrait-geometry--outline" aria-hidden="true" />
              <span className="portrait-geometry portrait-geometry--axis-x" aria-hidden="true" />
              <span className="portrait-geometry portrait-geometry--axis-y" aria-hidden="true" />
              <span className="portrait-geometry portrait-geometry--corner portrait-geometry--corner-tl" aria-hidden="true" />
              <span className="portrait-geometry portrait-geometry--corner portrait-geometry--corner-br" aria-hidden="true" />
              <span className="portrait-geometry portrait-geometry--node" aria-hidden="true" />
              <div className="portrait-frame">
                <img
                  src={content.portrait.src}
                  alt={content.portrait.alt}
                  width="880"
                  height="880"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              </div>
            </div>
            <figcaption className="portrait-caption">
              <span>{content.portrait.name}</span>
              <span>{content.portrait.location}</span>
            </figcaption>
          </figure>

          <div className="about__content">
            <div className="about__lead">
              <p className="about__lead-label">{content.leadLabel}</p>
              <p className="about__statement">
                {content.statementParts.map((part) => (
                  part.accent
                    ? <span key={part.id}>{part.text}</span>
                    : <span className="about__statement-plain" key={part.id}>{part.text}</span>
                ))}
              </p>
              <p className="about__summary">
                {content.summary}
              </p>
            </div>

            <address className="profile-links" aria-label="联系方式">
              <button
                className={copiedContact === 'email' ? 'is-copied' : undefined}
                type="button"
                onClick={() => copyProfileContact('email', email)}
                aria-label={copiedContact === 'email' ? `邮箱 ${email} 已复制` : `复制邮箱地址 ${email}`}
              >
                <span>{content.emailLabel}</span>
                <strong>{email}</strong>
                {copiedContact === 'email' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </button>
              <button
                className={copiedContact === 'phone' ? 'is-copied' : undefined}
                type="button"
                onClick={() => copyProfileContact('phone', phone)}
                aria-label={copiedContact === 'phone' ? `电话 ${phone} 已复制` : `复制电话号码 ${phone}`}
              >
                <span>{content.phoneLabel}</span>
                <strong>{phone}</strong>
                {copiedContact === 'phone' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </button>
              <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {copyMessage}
              </span>
            </address>
          </div>

          <dl className="metric-strip" aria-label="项目数据">
            {content.metrics.map((metric) => (
              <div className="metric" key={metric.id}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>

          <div className="timeline">
            <div className="timeline__heading">
              <h3>{content.timelineTitle}</h3>
              <span>{content.timelineRange}</span>
            </div>
            <div className="timeline__list">
              {content.experience.map((item) => (
                <article className="timeline__item" key={item.id}>
                  <p className="timeline__period">{item.period}</p>
                  <div className="timeline__identity">
                    <h4>{item.company}</h4>
                    <p className="timeline__role">{item.role}</p>
                  </div>
                  <p className="timeline__note">{item.note}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const CarouselProjectCard = memo(function CarouselProjectCard({
  project,
  onOpen,
  accessible,
  labels,
  mediaKey,
  mediaMounted,
}) {
  const mediaStyle = {
    '--project-image-background': project.imageBackground || undefined,
    '--project-image-fit': project.imageFit || undefined,
  }

  return (
    <div
      className="project-carousel__slot"
      aria-hidden={accessible ? undefined : 'true'}
      data-media-key={mediaKey}
    >
      <BorderGlow
        className="project-border-glow"
        {...projectGlowProps}
      >
        <button
          className={`project-carousel__card ${project.placeholder ? 'project-carousel__card--placeholder' : ''}`}
          data-project={project.id}
          type="button"
          tabIndex={accessible ? 0 : -1}
          onClick={(event) => onOpen(project, event.currentTarget)}
          aria-label={`查看项目：${project.title}${project.placeholder ? '，案例整理中' : ''}`}
        >
          <span className="project-carousel__media" style={mediaStyle}>
            <span className="project-carousel__image-wrap">
              {mediaMounted && (
                <img
                  src={getProjectCardImage(project)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  draggable="false"
                />
              )}
            </span>
            <span className="project-carousel__shade" aria-hidden="true" />
            <span className="project-carousel__index">{project.number}</span>
            {project.placeholder && <span className="project-carousel__pending">{labels.pending}</span>}
          </span>
          <span className="project-carousel__body">
            <span className="project-carousel__meta">
              <span>{project.type}</span>
              <span>{project.period}</span>
            </span>
            <strong>{project.title}</strong>
            <span className="project-carousel__result">{project.result}</span>
            <span className="project-carousel__action" aria-hidden="true">
              {project.placeholder ? labels.placeholderView : labels.view}
              <ArrowUpRight />
            </span>
          </span>
        </button>
      </BorderGlow>
    </div>
  )
})

function ProjectCarousel({ content, onOpen, isModalOpen }) {
  const projects = content.projects
  const viewportRef = useRef(null)
  const firstSetRef = useRef(null)
  const dragRef = useRef({ active: false, pointerId: null, startX: 0, startScroll: 0, lastX: 0, lastTime: 0, moved: false })
  const inertiaRef = useRef(0)
  const pauseUntilRef = useRef(0)
  const suppressClickUntilRef = useRef(0)
  const hoveredRef = useRef(false)
  const focusedRef = useRef(false)
  const modalOpenRef = useRef(isModalOpen)
  const carouselRuntimeRef = useRef({ request: () => {}, stop: () => {}, resume: () => {} })
  const [dragging, setDragging] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [accessibleCycle, setAccessibleCycle] = useState(1)
  const [mountedMediaKeys, setMountedMediaKeys] = useState(() => new Set())
  const accessibleCycleRef = useRef(1)
  const projectStructureKey = projects.map((project) => project.id).join('|')
  const cardLabels = useMemo(() => ({
    pending: content.pendingLabel,
    view: content.viewLabel,
    placeholderView: content.placeholderViewLabel,
  }), [content.pendingLabel, content.placeholderViewLabel, content.viewLabel])

  useEffect(() => {
    modalOpenRef.current = isModalOpen
    if (isModalOpen) {
      inertiaRef.current = 0
      carouselRuntimeRef.current.stop()
    }
    if (!isModalOpen) {
      pauseUntilRef.current = performance.now() + 800
      carouselRuntimeRef.current.request()
      carouselRuntimeRef.current.resume()
    }
  }, [isModalOpen])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined

    const slots = Array.from(viewport.querySelectorAll('.project-carousel__slot[data-media-key]'))
    const mountMedia = (keys) => {
      if (!keys.length) return
      setMountedMediaKeys((current) => {
        const next = new Set(current)
        let changed = false
        keys.forEach((key) => {
          if (!next.has(key)) {
            next.add(key)
            changed = true
          }
        })
        return changed ? next : current
      })
    }

    if (!('IntersectionObserver' in window)) {
      mountMedia(slots.map((slot) => slot.dataset.mediaKey).filter(Boolean))
      return undefined
    }

    let mediaObserver
    const observeNearbyMedia = () => {
      if (mediaObserver) return
      mediaObserver = new IntersectionObserver((entries) => {
        const nearbyKeys = []
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const key = entry.target.dataset.mediaKey
          if (key) nearbyKeys.push(key)
          mediaObserver.unobserve(entry.target)
        })
        mountMedia(nearbyKeys)
      }, {
        root: viewport,
        rootMargin: '0px 75% 0px 75%',
        threshold: 0.01,
      })
      slots.forEach((slot) => mediaObserver.observe(slot))
    }

    const proximityObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observeNearbyMedia()
      proximityObserver.disconnect()
    }, {
      rootMargin: '160px 0px',
      threshold: 0.01,
    })

    proximityObserver.observe(viewport)

    return () => {
      proximityObserver.disconnect()
      mediaObserver?.disconnect()
    }
  }, [projectStructureKey])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const firstSet = firstSetRef.current
    if (!viewport || !firstSet) return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let loopWidth = 0
    let initialized = false
    let frameId = 0
    let resumeTimerId = 0
    let lastTime = performance.now()
    let carouselVisible = false
    let visualGap = 0
    let cardInset = 0
    let viewportWidth = viewport.clientWidth
    let slotStates = []
    let transformsDirty = true
    let destroyed = false

    const clearResumeTimer = () => {
      window.clearTimeout(resumeTimerId)
      resumeTimerId = 0
    }

    const stopFrame = () => {
      window.cancelAnimationFrame(frameId)
      frameId = 0
      clearResumeTimer()
    }

    const updateAccessibleCycle = () => {
      if (!loopWidth) return
      const viewportCenter = viewport.scrollLeft + viewportWidth / 2
      const nextCycle = Math.max(0, Math.min(2, Math.floor(viewportCenter / loopWidth)))
      if (nextCycle !== accessibleCycleRef.current) {
        accessibleCycleRef.current = nextCycle
        setAccessibleCycle(nextCycle)
      }
    }

    const updateTransforms = () => {
      updateAccessibleCycle()
      transformsDirty = false
      const center = viewportWidth / 2
      const range = Math.max(center * 0.92, 1)

      // Keep the center/edge hierarchy even with reduced motion. That
      // preference stops autoplay and inertia, not the static card layout.
      if (viewportWidth <= 680) {
        slotStates.forEach((state) => {
          if (state.lastTransform !== 'none') {
            state.surface.style.transform = 'none'
            state.lastTransform = 'none'
          }
          if (state.lastOpacity !== '1') {
            state.surface.style.opacity = '1'
            state.lastOpacity = '1'
          }
          if (state.lastZIndex !== '1') {
            state.surface.style.zIndex = '1'
            state.lastZIndex = '1'
          }
        })
        return
      }

      const scrollLeft = viewport.scrollLeft
      const states = slotStates.map((state) => {
        const cardCenter = state.baseCenter - scrollLeft
        const signedDistance = Math.max(-1, Math.min(1, (cardCenter - center) / range))
        const distance = Math.min(1, Math.abs(signedDistance))
        const edge = distance * distance * (3 - 2 * distance)
        const focus = 1 - edge
        const scale = 1.08 - edge * 0.24
        const translateY = edge * 24
        const visualWidth = Math.max(0, state.width - cardInset) * scale

        return Object.assign(state, {
          cardCenter,
          visualWidth,
          scale,
          translateY,
          opacity: 1 - edge * 0.18,
          zIndex: 1 + Math.round(focus * 8),
        })
      })

      if (states.length < 2) return

      let rightIndex = states.findIndex((state) => state.cardCenter >= center)
      if (rightIndex === -1) rightIndex = states.length - 1
      rightIndex = Math.max(1, rightIndex)
      const leftIndex = rightIndex - 1
      const leftState = states[leftIndex]
      const rightState = states[rightIndex]
      const baseDistance = Math.max(rightState.cardCenter - leftState.cardCenter, 1)
      const progress = Math.max(0, Math.min(1, (center - leftState.cardCenter) / baseDistance))
      const centerPairDistance = leftState.visualWidth / 2 + visualGap + rightState.visualWidth / 2
      const desiredCenters = new Array(states.length)

      desiredCenters[leftIndex] = center - centerPairDistance * progress
      desiredCenters[rightIndex] = center + centerPairDistance * (1 - progress)

      for (let index = rightIndex + 1; index < states.length; index += 1) {
        desiredCenters[index] = desiredCenters[index - 1]
          + states[index - 1].visualWidth / 2
          + visualGap
          + states[index].visualWidth / 2
      }

      for (let index = leftIndex - 1; index >= 0; index -= 1) {
        desiredCenters[index] = desiredCenters[index + 1]
          - states[index + 1].visualWidth / 2
          - visualGap
          - states[index].visualWidth / 2
      }

      states.forEach((state, index) => {
        const renderNearby = state.cardCenter > -viewportWidth * 0.75
          && state.cardCenter < viewportWidth * 1.75
        if (!renderNearby) {
          if (state.lastTransform !== 'none') {
            state.surface.style.transform = 'none'
            state.lastTransform = 'none'
          }
          if (state.lastOpacity !== '1') {
            state.surface.style.opacity = '1'
            state.lastOpacity = '1'
          }
          if (state.lastZIndex !== '1') {
            state.surface.style.zIndex = '1'
            state.lastZIndex = '1'
          }
          return
        }

        const translateX = desiredCenters[index] - state.cardCenter
        const transform = `translate(${translateX.toFixed(3)}px, ${state.translateY.toFixed(3)}px) scale(${state.scale.toFixed(4)})`
        const opacity = state.opacity.toFixed(4)
        const zIndex = String(state.zIndex)
        if (state.lastTransform !== transform) {
          state.surface.style.transform = transform
          state.lastTransform = transform
        }
        if (state.lastOpacity !== opacity) {
          state.surface.style.opacity = opacity
          state.lastOpacity = opacity
        }
        if (state.lastZIndex !== zIndex) {
          state.surface.style.zIndex = zIndex
          state.lastZIndex = zIndex
        }
      })
    }

    const normalizeLoop = () => {
      if (!loopWidth) return false
      if (viewport.scrollLeft < loopWidth * 0.25) {
        viewport.scrollLeft += loopWidth
        transformsDirty = true
        return true
      }
      if (viewport.scrollLeft > loopWidth * 1.75) {
        viewport.scrollLeft -= loopWidth
        transformsDirty = true
        return true
      }
      return false
    }

    const measure = () => {
      const track = firstSet.parentElement
      const gap = track ? Number.parseFloat(window.getComputedStyle(track).columnGap) || 0 : 0
      const firstSlot = firstSet.querySelector('.project-carousel__slot')
      const firstSlotStyle = firstSlot ? window.getComputedStyle(firstSlot) : null
      cardInset = firstSlotStyle
        ? (Number.parseFloat(firstSlotStyle.paddingLeft) || 0) + (Number.parseFloat(firstSlotStyle.paddingRight) || 0)
        : 0
      visualGap = gap + cardInset
      const previousWidth = loopWidth
      loopWidth = firstSet.offsetWidth + gap
      viewportWidth = viewport.clientWidth
      slotStates = Array.from(viewport.querySelectorAll('.project-carousel__slot'))
        .map((slot) => {
          const surface = slot.firstElementChild
          if (!surface) return null
          const width = slot.offsetWidth
          return {
            surface,
            width,
            baseCenter: slot.offsetLeft + width / 2,
            lastTransform: null,
            lastOpacity: null,
            lastZIndex: null,
          }
        })
        .filter(Boolean)

      if (!initialized) {
        viewport.scrollLeft = loopWidth
        initialized = true
      } else if (previousWidth > 0) {
        viewport.scrollLeft = (viewport.scrollLeft / previousWidth) * loopWidth
      }
      normalizeLoop()
      transformsDirty = true
      updateTransforms()
    }

    const requestFrame = () => {
      if (destroyed || frameId || !carouselVisible || document.hidden || modalOpenRef.current) return
      frameId = window.requestAnimationFrame(animate)
    }

    const scheduleResume = () => {
      clearResumeTimer()
      if (
        destroyed
        || !carouselVisible
        || document.hidden
        || modalOpenRef.current
        || motionQuery.matches
      ) return

      if (Math.abs(inertiaRef.current) > 0.002) {
        requestFrame()
        return
      }

      if (hoveredRef.current || focusedRef.current || dragRef.current.active) return
      const wait = pauseUntilRef.current - performance.now()
      if (wait > 16) {
        resumeTimerId = window.setTimeout(requestFrame, wait)
      } else {
        requestFrame()
      }
    }

    const animate = (time) => {
      frameId = 0
      if (!carouselVisible || document.hidden) return

      const delta = Math.min(time - lastTime, 40)
      lastTime = time
      let moved = false

      if (!dragRef.current.active) {
        if (modalOpenRef.current || motionQuery.matches) {
          inertiaRef.current = 0
        } else if (Math.abs(inertiaRef.current) > 0.002) {
          viewport.scrollLeft += inertiaRef.current * delta
          inertiaRef.current *= Math.pow(0.92, delta / 16.67)
          moved = true
        } else if (
          !motionQuery.matches &&
          !hoveredRef.current &&
          !focusedRef.current &&
          !modalOpenRef.current &&
          carouselVisible &&
          !document.hidden &&
          time > pauseUntilRef.current
        ) {
          viewport.scrollLeft -= delta * 0.026
          moved = true
        }
      }

      normalizeLoop()
      if (moved) transformsDirty = true
      if (transformsDirty) updateTransforms()

      if (
        !modalOpenRef.current
        && !motionQuery.matches
        && (
          Math.abs(inertiaRef.current) > 0.002
          || (
            !hoveredRef.current
            && !focusedRef.current
            && !dragRef.current.active
            && time >= pauseUntilRef.current
          )
        )
      ) {
        requestFrame()
      } else {
        scheduleResume()
      }
    }

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      carouselVisible = entry.isIntersecting
      if (!carouselVisible) {
        stopFrame()
        return
      }
      transformsDirty = true
      lastTime = performance.now()
      requestFrame()
      scheduleResume()
    }, { threshold: 0.08 })

    const handleMotionChange = () => {
      setReducedMotion(motionQuery.matches)
      inertiaRef.current = 0
      transformsDirty = true
      updateTransforms()
      if (motionQuery.matches) stopFrame()
      else scheduleResume()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopFrame()
        return
      }
      transformsDirty = true
      lastTime = performance.now()
      requestFrame()
      scheduleResume()
    }

    const handleViewportScroll = () => {
      transformsDirty = true
      requestFrame()
    }

    let resizeObserver
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(viewport)
      resizeObserver.observe(firstSet)
    } else {
      window.addEventListener('resize', measure)
    }

    measure()
    setReducedMotion(motionQuery.matches)
    visibilityObserver.observe(viewport)
    viewport.addEventListener('scroll', handleViewportScroll, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    motionQuery.addEventListener?.('change', handleMotionChange)
    const runtime = {
      request: () => {
        transformsDirty = true
        requestFrame()
      },
      stop: stopFrame,
      resume: scheduleResume,
    }
    carouselRuntimeRef.current = runtime

    return () => {
      destroyed = true
      initialized = false
      stopFrame()
      visibilityObserver.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', handleViewportScroll)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      motionQuery.removeEventListener?.('change', handleMotionChange)
      if (carouselRuntimeRef.current === runtime) {
        carouselRuntimeRef.current = { request: () => {}, stop: () => {}, resume: () => {} }
      }
    }
  }, [projectStructureKey])

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const viewport = viewportRef.current
    if (!viewport) return
    const time = performance.now()
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: viewport.scrollLeft,
      lastX: event.clientX,
      lastTime: time,
      moved: false,
    }
    inertiaRef.current = 0
    pauseUntilRef.current = Number.POSITIVE_INFINITY
    carouselRuntimeRef.current.stop()
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    const viewport = viewportRef.current
    if (!drag.active || drag.pointerId !== event.pointerId || !viewport) return
    const now = performance.now()
    const totalDelta = event.clientX - drag.startX
    const frameDelta = event.clientX - drag.lastX
    const elapsed = Math.max(now - drag.lastTime, 1)
    if (!drag.moved && Math.abs(totalDelta) <= 7) return
    if (!drag.moved) {
      drag.moved = true
      viewport.setPointerCapture(event.pointerId)
      setDragging(true)
    }
    viewport.scrollLeft = drag.startScroll - totalDelta
    inertiaRef.current = reducedMotion
      ? 0
      : Math.max(-2.2, Math.min(2.2, -frameDelta / elapsed))
    drag.lastX = event.clientX
    drag.lastTime = now
    carouselRuntimeRef.current.request()
  }

  const endDrag = (event) => {
    const drag = dragRef.current
    const viewport = viewportRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
    if (drag.moved) {
      suppressClickUntilRef.current = performance.now() + 320
    } else {
      inertiaRef.current = 0
    }
    if (reducedMotion) inertiaRef.current = 0
    drag.active = false
    drag.pointerId = null
    pauseUntilRef.current = performance.now() + 1100
    setDragging(false)
    carouselRuntimeRef.current.resume()
  }

  const openProject = useCallback((project, trigger) => {
    if (performance.now() < suppressClickUntilRef.current) return
    inertiaRef.current = 0
    pauseUntilRef.current = Number.POSITIVE_INFINITY
    carouselRuntimeRef.current.stop()
    const accessibleTrigger = Array.from(
      viewportRef.current?.querySelectorAll('.project-carousel__set:not([aria-hidden]) [data-project]') || [],
    ).find((element) => element.dataset.project === project.id)
    onOpen(project, accessibleTrigger || trigger)
  }, [onOpen])

  const stepCarousel = useCallback((direction) => {
    const viewport = viewportRef.current
    const slot = viewport?.querySelector('.project-carousel__slot')
    if (!viewport || !slot) return
    const gap = Number.parseFloat(window.getComputedStyle(slot.parentElement).columnGap) || 0
    inertiaRef.current = 0
    pauseUntilRef.current = performance.now() + 1500
    viewport.scrollBy({
      left: direction * (slot.offsetWidth + gap),
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    carouselRuntimeRef.current.request()
    carouselRuntimeRef.current.resume()
  }, [reducedMotion])

  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    stepCarousel(event.key === 'ArrowLeft' ? -1 : 1)
  }

  const handleBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      focusedRef.current = false
      pauseUntilRef.current = performance.now() + 500
      carouselRuntimeRef.current.resume()
    }
  }

  return (
    <div className="project-carousel">
      <p className="sr-only" id="project-carousel-instructions">
        {content.carouselInstructions}
      </p>
      <div
        id="project-carousel-viewport"
        ref={viewportRef}
        className={`project-carousel__viewport ${dragging ? 'is-dragging' : ''}`}
        role="region"
        aria-roledescription="carousel"
        aria-labelledby="work-title"
        aria-describedby="project-carousel-instructions"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => {
          hoveredRef.current = true
          carouselRuntimeRef.current.stop()
        }}
        onMouseLeave={() => {
          hoveredRef.current = false
          pauseUntilRef.current = performance.now() + 450
          carouselRuntimeRef.current.resume()
        }}
        onFocusCapture={() => {
          focusedRef.current = true
          carouselRuntimeRef.current.stop()
        }}
        onBlurCapture={handleBlur}
      >
        <div className="project-carousel__track">
          {[0, 1, 2].map((cycle) => (
            <div
              className="project-carousel__set"
              ref={cycle === 0 ? firstSetRef : undefined}
              key={cycle}
              aria-hidden={cycle === accessibleCycle ? undefined : 'true'}
              data-motion-primary-set={cycle === 1 ? '' : undefined}
            >
              {projects.map((project) => {
                const mediaKey = `${cycle}-${project.id}`
                return (
                  <CarouselProjectCard
                    key={mediaKey}
                    project={project}
                    onOpen={openProject}
                    accessible={cycle === accessibleCycle}
                    labels={cardLabels}
                    mediaKey={mediaKey}
                    mediaMounted={mountedMediaKeys.has(mediaKey)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div
        className="project-carousel__controls"
        role="group"
        aria-label="精选项目切换"
        onMouseEnter={() => {
          hoveredRef.current = true
          carouselRuntimeRef.current.stop()
        }}
        onMouseLeave={() => {
          hoveredRef.current = false
          pauseUntilRef.current = performance.now() + 450
          carouselRuntimeRef.current.resume()
        }}
        onFocusCapture={() => {
          focusedRef.current = true
          carouselRuntimeRef.current.stop()
        }}
        onBlurCapture={handleBlur}
      >
        <button
          type="button"
          aria-label="查看上一个项目"
          aria-controls="project-carousel-viewport"
          onClick={() => stepCarousel(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="查看下一个项目"
          aria-controls="project-carousel-viewport"
          onClick={() => stepCarousel(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function ProjectModal({ project, labels, onClose, isOwner = false, onEdit }) {
  const closeRef = useRef(null)
  const panelRef = useRef(null)
  const gallery = [
    { id: `${project.id}-cover`, type: 'cover', label: labels.coverLabel, src: project.image, alt: project.imageAlt },
    ...(project.gallery || []).filter(
      (media) => media.src && media.type !== 'cover' && media.mediaType !== 'cover',
    ).slice(0, MAX_PROJECT_IMAGES),
  ]
  const [selectedMediaId, setSelectedMediaId] = useState(null)
  const [showFullImage, setShowFullImage] = useState(false)
  const activeMediaIndex = Math.max(0, gallery.findIndex((media) => media.id === selectedMediaId))
  const activeMedia = gallery[activeMediaIndex]

  useEffect(() => {
    setSelectedMediaId(null)
    setShowFullImage(false)
  }, [project.id])

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const focusable = Array.from(
          panelRef.current?.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) || [],
        )
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKey)
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button ref={closeRef} className="modal__close" type="button" onClick={onClose} aria-label="关闭项目详情">
          <X aria-hidden="true" />
        </button>
        <div className="modal__media-column">
          <div className="modal__visual" id="project-media-view" style={{ background: project.imageBackground || '#d9dde3' }}>
            <img
              key={activeMedia.id || activeMedia.src}
              src={activeMedia.src}
              alt={activeMedia.alt || project.imageAlt}
              style={{ objectFit: showFullImage ? 'contain' : 'cover' }}
            />
            <button className="modal__fit-toggle" type="button" aria-pressed={showFullImage}
              onClick={() => setShowFullImage((current) => !current)}>
              {showFullImage ? '铺满显示' : '完整查看'}
            </button>
          </div>
          {gallery.length > 1 && (
            <div className="modal__gallery" role="tablist" aria-label={labels.galleryLabel}>
              {gallery.map((media, index) => (
                <BorderGlow
                  {...projectGlowProps}
                  glowRadius={16}
                  className={`modal__thumbnail-glow ${activeMediaIndex === index ? 'is-active' : ''}`}
                  key={media.id || `${media.src}-${index}`}
                >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeMediaIndex === index}
                  aria-controls="project-media-view"
                  tabIndex={activeMediaIndex === index ? 0 : -1}
                  className={activeMediaIndex === index ? 'is-active' : ''}
                  onClick={() => setSelectedMediaId(media.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                    event.preventDefault()
                    const direction = event.key === 'ArrowRight' ? 1 : -1
                    const next = (index + direction + gallery.length) % gallery.length
                    setSelectedMediaId(gallery[next].id)
                    const nextTab = event.currentTarget.closest('[role="tablist"]')?.querySelectorAll('[role="tab"]')[next]
                    nextTab?.focus({ preventScroll: true })
                    nextTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                  }}
                >
                  <img src={media.src} alt="" loading="lazy" />
                  <span className="modal__thumbnail-label">{media.label || `图片 ${index + 1}`}</span>
                </button>
                </BorderGlow>
              ))}
            </div>
          )}
        </div>
        <div className="modal__content">
          <div className="modal__meta">
            <span>{project.number} / {labels.caseLabel}</span>
            <span>{project.period}</span>
          </div>
          <h2 id="modal-title">{project.title}</h2>
          <p className="modal__type">
            <span>{project.type}</span>
            {project.role && <span>{project.role}</span>}
          </p>
          <p className="modal__summary">{project.summary}</p>
          <div className="modal__notes">
            <div>
              <h3>{labels.decisionLabel}</h3>
              <p>{project.decision}</p>
            </div>
            <div>
              <h3>{labels.resultLabel}</h3>
              <p>{project.result}</p>
            </div>
          </div>
          <div className="modal__tags">
            {project.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          {isOwner && (
            <button className="modal__edit" type="button" onClick={() => onEdit?.(project.id)}>
              <Pencil aria-hidden="true" />
              {labels.editProjectLabel}
            </button>
          )}
        </div>
      </article>
    </div>
  )
}

function Work({ content, onOpen, isModalOpen }) {
  return (
    <section className="work section motion-section" id="work" aria-labelledby="work-title">
      <div className="page-shell">
        <SectionHeader
          index={content.index}
          label={content.label}
          title={<span id="work-title">{content.title}</span>}
          intro={content.intro}
        />
      </div>
      <ProjectCarousel content={content} onOpen={onOpen} isModalOpen={isModalOpen} />
    </section>
  )
}

function Capabilities({ content }) {
  return (
    <section className="capabilities section motion-section" id="capabilities" aria-labelledby="capabilities-title">
      <div className="page-shell">
        <SectionHeader
          index={content.index}
          label={content.label}
          title={<span id="capabilities-title">{content.title}</span>}
          intro={content.intro}
        />
        <div className="capability-grid">
          {content.items.map((item) => (
            <article className="capability-card" key={item.id || item.number}>
              <div className="capability-card__motion">
                <div className="capability-card__top">
                  <span>{item.number}</span>
                  <span>{item.en}</span>
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p className="capability-card__copy">{item.copy}</p>
                </div>
                <ul>
                  {item.items.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
                <p className="capability-card__evidence">{item.evidence}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Contact({ content, globalContent }) {
  const email = globalContent.email || ''
  const [copied, setCopied] = useState(false)
  const [loadAntigravity, setLoadAntigravity] = useState(false)
  const [antigravityCount, setAntigravityCount] = useState(220)
  const contactRef = useRef(null)
  const antigravityStageRef = useRef(null)

  useEffect(() => {
    const stage = antigravityStageRef.current
    if (!stage) return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    let inRange = false

    const sync = () => {
      const constrainedDevice =
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
        || (navigator.deviceMemory && navigator.deviceMemory <= 4)
      setAntigravityCount(constrainedDevice ? 160 : 240)
      setLoadAntigravity(
        inRange
        && !document.hidden
        && !motionQuery.matches
        && pointerQuery.matches
        && !connection?.saveData,
      )
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        inRange = entry.isIntersecting
        sync()
      },
      { rootMargin: '240px 0px', threshold: 0.01 },
    )

    observer.observe(stage)
    document.addEventListener('visibilitychange', sync)
    motionQuery.addEventListener?.('change', sync)
    pointerQuery.addEventListener?.('change', sync)
    connection?.addEventListener?.('change', sync)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motionQuery.removeEventListener?.('change', sync)
      pointerQuery.removeEventListener?.('change', sync)
      connection?.removeEventListener?.('change', sync)
    }
  }, [])

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.location.href = `mailto:${email}`
    }
  }

  return (
    <section
      ref={contactRef}
      className="contact motion-section"
      id="contact"
      aria-labelledby="contact-title"
    >
      <div ref={antigravityStageRef} className="contact__antigravity-stage">
        {loadAntigravity && (
          <Suspense fallback={null}>
            <div className="antigravity" aria-hidden="true">
              <Antigravity
                eventSource={contactRef}
                eventPrefix="client"
                count={antigravityCount}
                magnetRadius={11}
                ringRadius={9}
                waveSpeed={3.3}
                waveAmplitude={1.3}
                particleSize={1.5}
                lerpSpeed={0.09}
                color="#b7f34a"
                autoAnimate={false}
                particleVariance={1}
                rotationSpeed={0.1}
                depthFactor={1.1}
                pulseSpeed={4.3}
                particleShape="box"
              />
            </div>
          </Suspense>
        )}
      </div>
      <div className="page-shell contact__inner">
        <div className="section-display contact__display" aria-hidden="true">
          <span className="section-display__text">{content.displayLabel}</span>
        </div>
        <div className="contact__kicker">
          <span>{content.kickerLabel}</span>
          <span>{content.kickerLocation}</span>
        </div>
        <div className="contact__center">
          <p>{content.pretitle}</p>
          <h2 id="contact-title">{content.title}</h2>
          <div className="email-row">
            <a href={`mailto:${email}`}>{email}</a>
            <button type="button" onClick={copyEmail} aria-label="复制邮箱地址">
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              <span aria-live="polite">{copied ? content.copiedLabel : content.copyLabel}</span>
            </button>
          </div>
        </div>
        <div className="contact__footer">
          <div className="contact__links">
            {content.links.map((link) => (
              <a
                key={link.id || `${link.label}-${link.href}`}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noreferrer' : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>
          <p>{content.copyright}</p>
          <a className="back-to-top" href="#top" aria-label="返回顶部">
            <ArrowUp aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const localEditorAvailable = canUseLocalEditor()
  const studioMode = isEditorRoute(window.location)
  const siteRef = useRef(null)
  const progressRef = useRef(null)
  const scrolled = useScrollState(progressRef)
  const [siteContent, setSiteContent] = useState(defaultSiteContent)
  const [publishedRevision, setPublishedRevision] = useState(0)
  const [contentReady, setContentReady] = useState(studioMode)
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [ownerState, setOwnerState] = useState({ isOwner: false, editing: false })
  const projectTriggerRef = useRef(null)
  useSiteMotion(siteRef, studioMode, contentReady)

  useEffect(() => {
    let cancelled = false
    if (studioMode) return () => { cancelled = true }
    const controller = new AbortController()
    const applySnapshot = (snapshot) => {
      if (cancelled) return
      setSiteContent(snapshot.content)
      setPublishedRevision(snapshot.revision)
      setContentReady(true)
    }
    loadPublishedContent(defaultSiteContent, {
      onUpdate: applySnapshot,
      signal: controller.signal,
    }).then(applySnapshot)
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('is-loading-content', !contentReady)
    return () => document.body.classList.remove('is-loading-content')
  }, [contentReady])

  const activeProject = siteContent.work.projects.find((project) => project.id === activeProjectId) || null

  const openProject = useCallback((project, trigger) => {
    projectTriggerRef.current = trigger
    setActiveProjectId(project.id)
  }, [])

  const closeProject = useCallback(() => {
    setActiveProjectId(null)
    window.requestAnimationFrame(() => projectTriggerRef.current?.focus())
  }, [])

  const editProject = useCallback((projectId) => {
    setActiveProjectId(null)
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('zet:studio-section', {
        detail: { section: 'work', itemId: projectId },
      }))
    })
  }, [])

  const handlePublished = useCallback((content, revision) => {
    setSiteContent(content)
    setPublishedRevision(revision)
  }, [])

  return (
    <div
      className={`site-root ${contentReady ? 'is-content-ready' : 'is-content-pending'} ${studioMode ? 'is-studio-route' : ''}`}
      ref={siteRef}
    >
      <OpeningCurtain content={siteContent.opening} />
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />
      <Header scrolled={scrolled} content={siteContent.global} showStudio={localEditorAvailable || ownerState.isOwner} />
      <main id="main-content">
        <Hero content={siteContent.hero} />
        <Work content={siteContent.work} onOpen={openProject} isModalOpen={Boolean(activeProject)} />
        <About content={siteContent.profile} globalContent={siteContent.global} />
        <Capabilities content={siteContent.capabilities} />
        <Contact content={siteContent.contact} globalContent={siteContent.global} />
      </main>
      {activeProject && (
        <ProjectModal
          project={activeProject}
          labels={siteContent.work}
          onClose={closeProject}
          isOwner={studioMode && ownerState.isOwner && ownerState.editing}
          onEdit={editProject}
        />
      )}
      {studioMode && (
        <Suspense
          fallback={(
            <div className="studio-loading-fallback" role="status" aria-live="polite">
              <span aria-hidden="true" />
              <p>正在加载内容工作室…</p>
            </div>
          )}
        >
          <OwnerStudio
            content={siteContent}
            revision={publishedRevision}
            onPreviewChange={setSiteContent}
            onPublished={handlePublished}
            onOwnerStateChange={setOwnerState}
          />
        </Suspense>
      )}
    </div>
  )
}
