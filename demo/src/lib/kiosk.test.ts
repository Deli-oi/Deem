import { describe, expect, it } from 'vitest'
import { fit, isKiosk } from './kiosk'

describe('kiosk fit', () => {
  it('scales the 300x400 canvas to a 240x320 panel at exactly 0.8', () => {
    expect(fit(240, 320)).toEqual({ scale: 0.8, x: 0, y: 0 })
  })

  it('centers the canvas when the aspect ratio differs', () => {
    const { scale, x, y } = fit(400, 400)
    expect(scale).toBe(1)
    expect(x).toBe(50)
    expect(y).toBe(0)
  })

  it('is tiny in landscape, which is why the panel must be rotated to portrait', () => {
    expect(fit(320, 240).scale).toBeCloseTo(0.6)
  })

  it('detects ?kiosk', () => {
    expect(isKiosk('?kiosk')).toBe(true)
    expect(isKiosk('?kiosk=1&x=2')).toBe(true)
    expect(isKiosk('')).toBe(false)
  })
})
