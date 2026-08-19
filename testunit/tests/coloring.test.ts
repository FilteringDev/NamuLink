import test from 'ava'
import fc from 'fast-check'
import { ParseHexColor, HexDistance, HexRelativeLuminance, HexContrastRatio, IsReadableTextColor, TextReadabilityScore, IsInsideRegion, RegionCentroidRatio } from '@userscript/coloring.js'

test('ParseHexColor accepts #RGB, #RRGGBB, and no-# forms', T => {
  T.deepEqual(ParseHexColor('#fff'), [255, 255, 255])
  T.deepEqual(ParseHexColor('fff'), [255, 255, 255])
  T.deepEqual(ParseHexColor('#ffffff'), [255, 255, 255])
  T.deepEqual(ParseHexColor('ffffff'), [255, 255, 255])
  T.deepEqual(ParseHexColor('#1a2B3c'), [0x1a, 0x2b, 0x3c])
})

test('ParseHexColor rejects malformed input', T => {
  T.throws(() => ParseHexColor('#zzzzzz'))
  T.throws(() => ParseHexColor('#12345'))
  T.throws(() => ParseHexColor(''))
})

test('HexDistance is zero for identical colors and symmetric', T => {
  T.is(HexDistance('#123456', '#123456'), 0)
  T.is(HexDistance('#123456', '#abcdef'), HexDistance('#abcdef', '#123456'))
})

test('HexDistance matches the Euclidean RGB-cube distance for black/white', T => {
  T.true(Math.abs(HexDistance('#000000', '#ffffff') - Math.sqrt(255 ** 2 * 3)) < 1e-9)
})

test('HexRelativeLuminance matches WCAG black and white endpoints', T => {
  T.is(HexRelativeLuminance('#000'), 0)
  T.is(HexRelativeLuminance('#fff'), 1)
})

test('HexRelativeLuminance follows human-perception channel weights', T => {
  T.true(HexRelativeLuminance('#00ff00') > HexRelativeLuminance('#ff0000'))
  T.true(HexRelativeLuminance('#ff0000') > HexRelativeLuminance('#0000ff'))
})

test('HexContrastRatio matches WCAG contrast ratio endpoints', T => {
  T.is(HexContrastRatio('#000', '#fff'), 21)
  T.is(HexContrastRatio('#123456', '#123456'), 1)
  T.is(HexContrastRatio('#fff', '#000'), HexContrastRatio('#000', '#fff'))
})

test('IsReadableTextColor applies WCAG AA and AAA text thresholds', T => {
  T.true(IsReadableTextColor('#767676', '#ffffff'))
  T.false(IsReadableTextColor('#777777', '#ffffff'))
  T.true(IsReadableTextColor('#777777', '#ffffff', { LargeText: true }))
  T.false(IsReadableTextColor('#767676', '#ffffff', { Enhanced: true }))
  T.true(IsReadableTextColor('#767676', '#ffffff', { LargeText: true, Enhanced: true }))
})

test('TextReadabilityScore normalizes contrast ratio for ranking text colors', T => {
  T.is(TextReadabilityScore('#000', '#000'), 0)
  T.is(TextReadabilityScore('#000', '#fff'), 1)
  T.true(TextReadabilityScore('#444444', '#ffffff') > TextReadabilityScore('#777777', '#ffffff'))
})

test('text readability helpers reject malformed HEX input', T => {
  T.throws(() => HexRelativeLuminance('#zzzzzz'))
  T.throws(() => HexContrastRatio('#000', '#12345'))
  T.throws(() => IsReadableTextColor('', '#fff'))
  T.throws(() => TextReadabilityScore('#000', ''))
})

test('IsInsideRegion treats a single-point region as an exact match', T => {
  const Region = ['#808080']
  T.true(IsInsideRegion('#808080', Region))
  T.false(IsInsideRegion('#808081', Region))
})

test('IsInsideRegion handles a collinear (line) region', T => {
  const Region = ['#000000', '#ffffff']
  T.true(IsInsideRegion('#000000', Region))
  T.true(IsInsideRegion('#ffffff', Region))
  T.true(IsInsideRegion('#404040', Region))
  T.false(IsInsideRegion('#ff0000', Region))
})

test('IsInsideRegion handles a coplanar (polygon) region', T => {
  // Square at B=0: R,G both within [50, 200]
  const Square = ['#323200', '#c83200', '#c8c800', '#32c800']

  T.true(IsInsideRegion('#646400', Square))
  T.true(IsInsideRegion('#323200', Square))
  T.false(IsInsideRegion('#0a0a00', Square))
  T.false(IsInsideRegion('#64640a', Square))
})

test('IsInsideRegion handles a volumetric (cube) region', T => {
  const Cube = [
    '#323232', '#c83232', '#32c832', '#3232c8',
    '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
  ]

  T.true(IsInsideRegion('#7d7d7d', Cube))
  T.true(IsInsideRegion('#323232', Cube))
  T.false(IsInsideRegion('#fafafa', Cube))
})

test('IsInsideRegion always accepts convex combinations of RegionPoints', T => {
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

  T.pass()
})

test('RegionCentroidRatio is 1 at a single-point region and -1 elsewhere', T => {
  const Region = ['#808080']
  T.is(RegionCentroidRatio('#808080', Region), 1)
  T.is(RegionCentroidRatio('#808081', Region), -1)
})

test('RegionCentroidRatio uses the midpoint of a collinear hull instead of the point average', T => {
  const Region = ['#000000', '#0a0a0a', '#c8c8c8']

  T.is(RegionCentroidRatio('#646464', Region), 1)
  T.not(RegionCentroidRatio('#464646', Region), 1)
})

test('RegionCentroidRatio uses the area centroid of a polygon instead of the point average', T => {
  const Region = ['#000000', '#c80000', '#c8c800', '#00c800', '#006400']

  T.is(RegionCentroidRatio('#646400', Region), 1)
  T.not(RegionCentroidRatio('#506400', Region), 1)
})

test('RegionCentroidRatio uses the divergence-theorem volume centroid of a pyramid', T => {
  const Pyramid = ['#000000', '#c80000', '#c8c800', '#00c800', '#6464c8']

  T.is(RegionCentroidRatio('#646432', Pyramid), 1)
  T.not(RegionCentroidRatio('#646428', Pyramid), 1)
})

test('RegionCentroidRatio ignores repeated points when finding a volume centroid', T => {
  const Pyramid = ['#000000', '#c80000', '#c8c800', '#00c800', '#6464c8', '#6464c8']

  T.is(RegionCentroidRatio('#646432', Pyramid), 1)
})

test('RegionCentroidRatio is 1 at the centroid, 0 on the boundary, and -1 outside a cube region', T => {
  const Cube = [
    '#323232', '#c83232', '#32c832', '#3232c8',
    '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
  ]

  T.is(RegionCentroidRatio('#7d7d7d', Cube), 1)
  T.true(Math.abs(RegionCentroidRatio('#c8c8c8', Cube)) < 1e-6)
  T.is(RegionCentroidRatio('#fafafa', Cube), -1)
})

test('RegionCentroidRatio decreases monotonically from centroid towards the boundary', T => {
  const Cube = [
    '#323232', '#c83232', '#32c832', '#3232c8',
    '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
  ]

  const Near = RegionCentroidRatio('#a2a2a2', Cube)
  const Middle = RegionCentroidRatio('#b5b5b5', Cube)
  const Far = RegionCentroidRatio('#c3c3c3', Cube)

  T.true(Near > Middle)
  T.true(Middle > Far)
  T.true(Far > 0)
})
