import { test, expect } from 'vitest'
import fc from 'fast-check'
import { ParseHexColor, HexDistance, HexRelativeLuminance, HexContrastRatio, IsReadableTextColor, TextReadabilityScore, IsInsideRegion, RegionCentroidRatio } from '@userscript/coloring/coloring.js'

test('ParseHexColor accepts #RGB, #RRGGBB, and no-# forms', () => {
  expect(ParseHexColor('#fff')).toEqual([255, 255, 255])
  expect(ParseHexColor('fff')).toEqual([255, 255, 255])
  expect(ParseHexColor('#ffffff')).toEqual([255, 255, 255])
  expect(ParseHexColor('ffffff')).toEqual([255, 255, 255])
  expect(ParseHexColor('#1a2B3c')).toEqual([0x1a, 0x2b, 0x3c])
})

test('ParseHexColor rejects malformed input', () => {
  expect(() => ParseHexColor('#zzzzzz')).toThrow()
  expect(() => ParseHexColor('#12345')).toThrow()
  expect(() => ParseHexColor('')).toThrow()
})

test('HexDistance is zero for identical colors and symmetric', () => {
  expect(HexDistance('#123456', '#123456')).toBe(0)
  expect(HexDistance('#123456', '#abcdef')).toBe(HexDistance('#abcdef', '#123456'))
})

test('HexDistance matches the Euclidean RGB-cube distance for black/white', () => {
  expect(Math.abs(HexDistance('#000000', '#ffffff') - Math.sqrt(255 ** 2 * 3)) < 1e-9).toBe(true)
})

test('HexRelativeLuminance matches WCAG black and white endpoints', () => {
  expect(HexRelativeLuminance('#000')).toBe(0)
  expect(HexRelativeLuminance('#fff')).toBe(1)
})

test('HexRelativeLuminance follows human-perception channel weights', () => {
  expect(HexRelativeLuminance('#00ff00') > HexRelativeLuminance('#ff0000')).toBe(true)
  expect(HexRelativeLuminance('#ff0000') > HexRelativeLuminance('#0000ff')).toBe(true)
})

test('HexContrastRatio matches WCAG contrast ratio endpoints', () => {
  expect(HexContrastRatio('#000', '#fff')).toBe(21)
  expect(HexContrastRatio('#123456', '#123456')).toBe(1)
  expect(HexContrastRatio('#fff', '#000')).toBe(HexContrastRatio('#000', '#fff'))
})

test('IsReadableTextColor applies WCAG AA and AAA text thresholds', () => {
  expect(IsReadableTextColor('#767676', '#ffffff')).toBe(true)
  expect(IsReadableTextColor('#777777', '#ffffff')).toBe(false)
  expect(IsReadableTextColor('#777777', '#ffffff', { LargeText: true })).toBe(true)
  expect(IsReadableTextColor('#767676', '#ffffff', { Enhanced: true })).toBe(false)
  expect(IsReadableTextColor('#767676', '#ffffff', { LargeText: true, Enhanced: true })).toBe(true)
})

test('TextReadabilityScore normalizes contrast ratio for ranking text colors', () => {
  expect(TextReadabilityScore('#000', '#000')).toBe(0)
  expect(TextReadabilityScore('#000', '#fff')).toBe(1)
  expect(TextReadabilityScore('#444444', '#ffffff') > TextReadabilityScore('#777777', '#ffffff')).toBe(true)
})

test('text readability helpers reject malformed HEX input', () => {
  expect(() => HexRelativeLuminance('#zzzzzz')).toThrow()
  expect(() => HexContrastRatio('#000', '#12345')).toThrow()
  expect(() => IsReadableTextColor('', '#fff')).toThrow()
  expect(() => TextReadabilityScore('#000', '')).toThrow()
})

test('IsInsideRegion treats a single-point region as an exact match', () => {
  const Region = ['#808080']
  expect(IsInsideRegion('#808080', Region)).toBe(true)
  expect(IsInsideRegion('#808081', Region)).toBe(false)
})

test('IsInsideRegion handles a collinear (line) region', () => {
  const Region = ['#000000', '#ffffff']
  expect(IsInsideRegion('#000000', Region)).toBe(true)
  expect(IsInsideRegion('#ffffff', Region)).toBe(true)
  expect(IsInsideRegion('#404040', Region)).toBe(true)
  expect(IsInsideRegion('#ff0000', Region)).toBe(false)
})

test('IsInsideRegion handles a coplanar (polygon) region', () => {
  // Square at B=0: R,G both within [50, 200]
  const Square = ['#323200', '#c83200', '#c8c800', '#32c800']

  expect(IsInsideRegion('#646400', Square)).toBe(true)
  expect(IsInsideRegion('#323200', Square)).toBe(true)
  expect(IsInsideRegion('#0a0a00', Square)).toBe(false)
  expect(IsInsideRegion('#64640a', Square)).toBe(false)
})

test('IsInsideRegion handles a volumetric (cube) region', () => {
  const Cube = [
    '#323232', '#c83232', '#32c832', '#3232c8',
    '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
  ]

  expect(IsInsideRegion('#7d7d7d', Cube)).toBe(true)
  expect(IsInsideRegion('#323232', Cube)).toBe(true)
  expect(IsInsideRegion('#fafafa', Cube)).toBe(false)
})

test('IsInsideRegion always accepts convex combinations of RegionPoints', () => {
  const Cube = [
    '#323232', '#c83232', '#32c832', '#3232c8',
    '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
  ]
  const Points = Cube.map(ParseHexColor)

  fc.assert(fc.property(fc.array(fc.float({ min: 0, max: 1, noNaN: true }), { minLength: Points.length, maxLength: Points.length }), Weights => {
    const Total = Weights.reduce((Sum, Weight) => Sum + Weight, 0)
    if (Total < 1e-6) return true

    const Normalized = Weights.map(Weight => Weight / Total)
    const Combined = Points.reduce((Sum, Point, Index) => [
      Sum[0] + Point[0] * Normalized[Index],
      Sum[1] + Point[1] * Normalized[Index],
      Sum[2] + Point[2] * Normalized[Index],
    ], [0, 0, 0])
    const Hex = `#${Combined.map(Component => Math.round(Component).toString(16).padStart(2, '0')).join('')}`

    return IsInsideRegion(Hex, Cube)
  }))

  expect(true).toBe(true)
})

test('RegionCentroidRatio is 1 at a single-point region and -1 elsewhere', () => {
  const Region = ['#808080']
  expect(RegionCentroidRatio('#808080', Region)).toBe(1)
  expect(RegionCentroidRatio('#808081', Region)).toBe(-1)
})

test('RegionCentroidRatio uses the midpoint of a collinear hull instead of the point average', () => {
  const Region = ['#000000', '#0a0a0a', '#c8c8c8']

  expect(RegionCentroidRatio('#646464', Region)).toBe(1)
  expect(RegionCentroidRatio('#464646', Region)).not.toBe(1)
})

test('RegionCentroidRatio uses the area centroid of a polygon instead of the point average', () => {
  const Region = ['#000000', '#c80000', '#c8c800', '#00c800', '#006400']

  expect(RegionCentroidRatio('#646400', Region)).toBe(1)
  expect(RegionCentroidRatio('#506400', Region)).not.toBe(1)
})

test('RegionCentroidRatio uses the divergence-theorem volume centroid of a pyramid', () => {
  const Pyramid = ['#000000', '#c80000', '#c8c800', '#00c800', '#6464c8']

  expect(RegionCentroidRatio('#646432', Pyramid)).toBe(1)
  expect(RegionCentroidRatio('#646428', Pyramid)).not.toBe(1)
})

test('RegionCentroidRatio ignores repeated points when finding a volume centroid', () => {
  const Pyramid = ['#000000', '#c80000', '#c8c800', '#00c800', '#6464c8', '#6464c8']

  expect(RegionCentroidRatio('#646432', Pyramid)).toBe(1)
})

test('RegionCentroidRatio is 1 at the centroid, 0 on the boundary, and -1 outside a cube region', () => {
  const Cube = [
    '#323232', '#c83232', '#32c832', '#3232c8',
    '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
  ]

  expect(RegionCentroidRatio('#7d7d7d', Cube)).toBe(1)
  expect(Math.abs(RegionCentroidRatio('#c8c8c8', Cube)) < 1e-6).toBe(true)
  expect(RegionCentroidRatio('#fafafa', Cube)).toBe(-1)
})

test('RegionCentroidRatio decreases monotonically from centroid towards the boundary', () => {
  const Cube = [
    '#323232', '#c83232', '#32c832', '#3232c8',
    '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
  ]

  const Near = RegionCentroidRatio('#a2a2a2', Cube)
  const Middle = RegionCentroidRatio('#b5b5b5', Cube)
  const Far = RegionCentroidRatio('#c3c3c3', Cube)

  expect(Near > Middle).toBe(true)
  expect(Middle > Far).toBe(true)
  expect(Far > 0).toBe(true)
})
