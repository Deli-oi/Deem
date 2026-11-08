/**
 * Kiosk mode: the page IS the device screen (no bezel, no page chrome), for the real
 * 2.8" panel. Open it with `?kiosk` (e.g. Chromium --kiosk "http://localhost:3000/?kiosk").
 *
 * The UI is laid out on a fixed 300x400 (3:4 portrait) canvas. In kiosk mode that canvas
 * is scaled to fill the viewport, so a 240x320 panel gets exactly 0.8x.
 */
export const DESIGN_W = 300
export const DESIGN_H = 400

export function isKiosk(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has('kiosk')
}

/** Scale and top-left offset that fit the design canvas centered in a viewport. */
export function fit(viewW: number, viewH: number): { scale: number; x: number; y: number } {
  const scale = Math.min(viewW / DESIGN_W, viewH / DESIGN_H)
  return { scale, x: (viewW - DESIGN_W * scale) / 2, y: (viewH - DESIGN_H * scale) / 2 }
}

/** Applies kiosk scaling as CSS variables and keeps them current on resize. Returns a cleanup. */
export function startKiosk(): () => void {
  const root = document.documentElement
  root.classList.add('kiosk')
  const apply = () => {
    const { scale, x, y } = fit(window.innerWidth, window.innerHeight)
    root.style.setProperty('--k', String(scale))
    root.style.setProperty('--kx', `${x}px`)
    root.style.setProperty('--ky', `${y}px`)
  }
  apply()
  window.addEventListener('resize', apply)
  return () => {
    window.removeEventListener('resize', apply)
    root.classList.remove('kiosk')
  }
}
