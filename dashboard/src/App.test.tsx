import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

const plantButton = (id: string) => screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.includes(id)) as HTMLElement

describe('greenhouse dashboard', () => {
  it('shows the whole greenhouse: 45 clickable plants and 3 air hubs', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('.gh-plant')).toHaveLength(45)
    expect(container.querySelectorAll('.gh-hub')).toHaveLength(3)
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('has the greenhouse first, then overall health, then by type, then plant by plant', () => {
    const { container } = render(<App />)
    const order = ['map', 'health', 'types', 'plants'].map((id) => container.querySelector(`#${id}`))
    order.forEach((el) => expect(el).toBeTruthy())
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('opens a plant on click with the device display, and closes on Escape', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.gh-modal')).toBeNull()
    fireEvent.click(plantButton('A-1-1'))
    const modal = container.querySelector('.gh-modal') as HTMLElement
    expect(modal).toBeTruthy()
    expect(modal.querySelector('.screen')).toBeTruthy() // the same mini display the device shows
    expect(within(modal).getByText(/Soil quality/i)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.gh-modal')).toBeNull()
  })

  it('shows the wilted failure screen for a plant with a soil problem', () => {
    const { container } = render(<App />)
    fireEvent.click(plantButton('A-2-3'))
    const modal = container.querySelector('.gh-modal') as HTMLElement
    expect(modal.querySelector('.failure-page')).toBeTruthy()
    expect(modal.querySelector('.wilted-sprite')?.getAttribute('src')).toBe('/sprites/wilted/snake_plant.png')
    expect(within(modal).getAllByText(/Soil needs food/i).length).toBeGreaterThan(0)
  })

  it('shows the normal health page for a healthy plant', () => {
    const { container } = render(<App />)
    fireEvent.click(plantButton('A-1-1'))
    const modal = container.querySelector('.gh-modal') as HTMLElement
    expect(modal.querySelector('.failure-page')).toBeNull()
    expect(modal.querySelector('.health-activity .act-main')).toBeTruthy()
  })

  it('steps between plants and switches display pages from the tabs', () => {
    const { container } = render(<App />)
    fireEvent.click(plantButton('A-1-1'))
    fireEvent.click(screen.getByText(/Next plant/))
    expect(container.querySelector('.gh-popup-head p')?.textContent).toContain('A-1-2')
    fireEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(container.querySelector('.screen-track')?.getAttribute('data-page')).toBe('history')
  })

  it('opens an air hub with the larger sensors', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByLabelText('Air quality hub, zone B'))
    const modal = container.querySelector('.gh-modal') as HTMLElement
    expect(within(modal).getByText('CO₂')).toBeTruthy()
    expect(within(modal).getByText(/Vents/)).toBeTruthy()
  })

  it('lists exactly the five plants that need a person, and each opens its plant', () => {
    const { container } = render(<App />)
    const todo = container.querySelectorAll('.gh-todo li button')
    expect(todo).toHaveLength(5)
    fireEvent.click(todo[0])
    expect(container.querySelector('.gh-modal')).toBeTruthy()
  })

  it('picking a plant type dims the others on the map and filters the list', () => {
    const { container } = render(<App />)
    const card = [...container.querySelectorAll('.gh-type')].find((b) => /snake plant/i.test(b.textContent ?? '')) as HTMLElement
    fireEvent.click(card)
    expect(container.querySelectorAll('.gh-plant.dim')).toHaveLength(41)
    expect(container.querySelectorAll('.gh-plantcard')).toHaveLength(4)
  })

  it('can show only the plants that need attention', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByLabelText(/Only plants that need me/))
    expect(container.querySelectorAll('.gh-plantcard')).toHaveLength(5)
  })
})
