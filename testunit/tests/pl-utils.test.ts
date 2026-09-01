import { afterEach, expect, test, vi } from 'vitest'
import { IsEffectiveImageContainer } from '@userscript/PL/utils.js'

type TestElementOptions = {
  Attributes?: Record<string, string | null>
  Display?: string
  Height?: number
  Images?: HTMLElement[]
  Sources?: HTMLElement[]
  Width?: number
}

function CreateElement(TagName: string, Options: TestElementOptions = {}): HTMLElement {
  const {
    Attributes = {},
    Display = 'block',
    Height = 100,
    Images = [],
    Sources = [],
    Width = 100,
  } = Options

  return {
    tagName: TagName.toUpperCase(),
    getAttribute(Name: string): string | null {
      return Attributes[Name] ?? null
    },
    getBoundingClientRect(): DOMRect {
      return { width: Width, height: Height } as DOMRect
    },
    querySelectorAll(Selector: string): NodeListOf<Element> {
      const Elements = Selector === 'source' ? Sources : Selector === 'img' ? Images : []
      return Elements as unknown as NodeListOf<Element>
    },
    dataset: { Display },
  } as unknown as HTMLElement
}

afterEach(() => vi.unstubAllGlobals())

test('accepts displayed img elements with a source', () => {
  vi.stubGlobal('getComputedStyle', (HTMLElem: HTMLElement) => ({
    getPropertyValue: () => HTMLElem.dataset.Display ?? 'block',
  }))

  expect(IsEffectiveImageContainer(CreateElement('img', { Attributes: { src: 'image.png' } }))).toBe(true)
})

test('rejects imgs without a usable source or visible layout', () => {
  vi.stubGlobal('getComputedStyle', (HTMLElem: HTMLElement) => ({
    getPropertyValue: () => HTMLElem.dataset.Display ?? 'block',
  }))

  expect(IsEffectiveImageContainer(CreateElement('img'))).toBe(false)
  expect(IsEffectiveImageContainer(CreateElement('img', { Attributes: { src: '   ' } }))).toBe(false)
  expect(IsEffectiveImageContainer(CreateElement('img', { Attributes: { src: 'image.png' }, Width: 0 }))).toBe(false)
  expect(IsEffectiveImageContainer(CreateElement('img', { Attributes: { src: 'image.png' }, Display: 'none' }))).toBe(false)
})

test('accepts displayed pictures with source candidates and fallback images', () => {
  vi.stubGlobal('getComputedStyle', (HTMLElem: HTMLElement) => ({
    getPropertyValue: () => HTMLElem.dataset.Display ?? 'block',
  }))

  const Source = CreateElement('source', { Attributes: { srcset: 'image.webp 1x' } })
  const Image = CreateElement('img', { Attributes: { src: 'image.png' } })
  const Picture = CreateElement('picture', { Sources: [Source], Images: [Image] })

  expect(IsEffectiveImageContainer(Picture)).toBe(true)
})

test('rejects incomplete pictures and non-image containers', () => {
  vi.stubGlobal('getComputedStyle', (HTMLElem: HTMLElement) => ({
    getPropertyValue: () => HTMLElem.dataset.Display ?? 'block',
  }))

  const Source = CreateElement('source', { Attributes: { srcset: 'image.webp 1x' } })
  const Image = CreateElement('img', { Attributes: { src: 'image.png' } })

  expect(IsEffectiveImageContainer(CreateElement('picture', { Images: [Image] }))).toBe(false)
  expect(IsEffectiveImageContainer(CreateElement('picture', { Sources: [Source] }))).toBe(false)
  expect(IsEffectiveImageContainer(CreateElement('picture', {
    Sources: [CreateElement('source', { Attributes: { srcset: ' ' } })],
    Images: [Image],
  }))).toBe(false)
  expect(IsEffectiveImageContainer(CreateElement('picture', { Sources: [Source], Images: [Image], Display: 'none' }))).toBe(false)
  expect(IsEffectiveImageContainer(CreateElement('div', { Images: [Image] }))).toBe(false)
})