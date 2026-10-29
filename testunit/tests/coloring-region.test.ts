import { test, expect } from 'vitest'
import { IsInsideRegion, RegionCentroidRatio } from '@userscript/coloring/coloring.js'

function HexOfRGB(R: number, G: number, B: number): string {
  const Clamp = (Value: number) => Math.max(0, Math.min(255, Math.round(Value)))
  return `#${[R, G, B].map(Value => Clamp(Value).toString(16).padStart(2, '0')).join('')}`
}

// A cube with each axis ranging over [BoxMin, BoxMax], so membership reduces to independent per-channel interval containment.
const BoxMin = 50
const BoxMax = 200
const BoxCenter = 125
const BoxHalfExtent = 75
const Box: string[] = [
  '#323232', '#c83232', '#32c832', '#3232c8',
  '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8',
]

// A 2-point line varying only R, so membership reduces to "R within [0, 100] and G/B unchanged".
const Line: string[] = ['#000000', '#640000']

// A rectangle in the R/G plane with B fixed at 0, so membership reduces to independent R/G interval containment.
const Square: string[] = ['#323200', '#c83200', '#c8c800', '#32c800']

// A right triangle with legs along R and G, B fixed at 0, so membership reduces to R>=0 && G>=0 && R+G<=150.
const Triangle: string[] = ['#000000', '#960000', '#009600']

// A pyramid (square base + apex), reused from the geometry primitives covered in coloring.test.ts.
const Pyramid: string[] = ['#000000', '#c80000', '#c8c800', '#00c800', '#6464c8']

// Section A: axis-aligned box membership grid (below-min / at-min / at-max / above-max per channel)
const BoxAxisSamples: readonly number[] = [30, 50, 200, 220]

for (const R of BoxAxisSamples) {
  for (const G of BoxAxisSamples) {
    for (const B of BoxAxisSamples) {
      const Expected = R >= BoxMin && R <= BoxMax && G >= BoxMin && G <= BoxMax && B >= BoxMin && B <= BoxMax
      test(`IsInsideRegion of box at R=${R} G=${G} B=${B} is ${Expected}`, () => {
        expect(IsInsideRegion(HexOfRGB(R, G, B), Box)).toBe(Expected)
      })
    }
  }
}

// Section B: collinear line membership
const LineOnAxisSamples: readonly number[] = [0, 10, 25, 50, 75, 90, 99, 100, 101, 120, 150, 255]

for (const R of LineOnAxisSamples) {
  const Expected = R >= 0 && R <= 100
  test(`IsInsideRegion of line at R=${R} is ${Expected}`, () => {
    expect(IsInsideRegion(HexOfRGB(R, 0, 0), Line)).toBe(Expected)
  })
}

test('IsInsideRegion of line rejects a point off the line via G', () => {
  expect(IsInsideRegion(HexOfRGB(50, 5, 0), Line)).toBe(false)
})

test('IsInsideRegion of line rejects a point off the line via B', () => {
  expect(IsInsideRegion(HexOfRGB(50, 0, 5), Line)).toBe(false)
})

test('IsInsideRegion of line rejects a point off the line via both G and B', () => {
  expect(IsInsideRegion(HexOfRGB(50, 5, 5), Line)).toBe(false)
})

// Section C: rectangle (coplanar polygon) membership
for (const R of BoxAxisSamples) {
  for (const G of BoxAxisSamples) {
    const Expected = R >= BoxMin && R <= BoxMax && G >= BoxMin && G <= BoxMax
    test(`IsInsideRegion of rectangle at R=${R} G=${G} is ${Expected}`, () => {
      expect(IsInsideRegion(HexOfRGB(R, G, 0), Square)).toBe(Expected)
    })
  }
}

test('IsInsideRegion of rectangle rejects an otherwise-valid point off its plane (B=5)', () => {
  expect(IsInsideRegion(HexOfRGB(100, 100, 5), Square)).toBe(false)
})

test('IsInsideRegion of rectangle rejects an otherwise-valid point off its plane (B=10)', () => {
  expect(IsInsideRegion(HexOfRGB(150, 150, 10), Square)).toBe(false)
})

test('IsInsideRegion of rectangle rejects a boundary point off its plane (B=1)', () => {
  expect(IsInsideRegion(HexOfRGB(50, 50, 1), Square)).toBe(false)
})

// Section D: right-triangle (linear inequality) membership
const TriangleSamples: readonly [number, number, boolean][] = [
  [0, 0, true],
  [150, 0, true],
  [0, 150, true],
  [75, 75, true],
  [50, 50, true],
  [10, 10, true],
  [140, 5, true],
  [1, 1, true],
  [100, 100, false],
  [0, 160, false],
  [80, 80, false],
  [140, 15, false],
  [160, 0, false],
]

for (const [R, G, Expected] of TriangleSamples) {
  test(`IsInsideRegion of triangle at R=${R} G=${G} is ${Expected}`, () => {
    expect(IsInsideRegion(HexOfRGB(R, G, 0), Triangle)).toBe(Expected)
  })
}

// Section E: pyramid (volumetric) membership via convex-combination (always inside) and bounding-box (always outside) reasoning
const PyramidVertices: readonly [number, number, number][] = [[0, 0, 0], [200, 0, 0], [200, 200, 0], [0, 200, 0], [100, 100, 200]]

for (const [Index, Vertex] of PyramidVertices.entries()) {
  test(`IsInsideRegion of pyramid accepts its own vertex #${Index}`, () => {
    expect(IsInsideRegion(HexOfRGB(...Vertex), Pyramid)).toBe(true)
  })
}

test('IsInsideRegion of pyramid accepts the average of all 5 vertices', () => {
  expect(IsInsideRegion(HexOfRGB(100, 100, 40), Pyramid)).toBe(true)
})

test('IsInsideRegion of pyramid accepts the midpoint of the base and apex', () => {
  expect(IsInsideRegion(HexOfRGB(50, 50, 100), Pyramid)).toBe(true)
})

test('IsInsideRegion of pyramid accepts the midpoint of two base vertices', () => {
  expect(IsInsideRegion(HexOfRGB(200, 100, 0), Pyramid)).toBe(true)
})

test('IsInsideRegion of pyramid accepts the average of the 4 base vertices', () => {
  expect(IsInsideRegion(HexOfRGB(100, 100, 0), Pyramid)).toBe(true)
})

test('IsInsideRegion of pyramid rejects a point with R beyond every vertex', () => {
  expect(IsInsideRegion(HexOfRGB(255, 0, 0), Pyramid)).toBe(false)
})

test('IsInsideRegion of pyramid rejects a point with G beyond every vertex', () => {
  expect(IsInsideRegion(HexOfRGB(0, 255, 0), Pyramid)).toBe(false)
})

test('IsInsideRegion of pyramid rejects a point with B beyond every vertex', () => {
  expect(IsInsideRegion(HexOfRGB(0, 0, 255), Pyramid)).toBe(false)
})

test('IsInsideRegion of pyramid rejects a point beyond every vertex on all channels', () => {
  expect(IsInsideRegion(HexOfRGB(255, 255, 255), Pyramid)).toBe(false)
})

// Section F: degenerate inputs and error cases
test('IsInsideRegion tolerates a region with a duplicated point', () => {
  const BoxWithDuplicate = [...Box, Box[0]]
  expect(IsInsideRegion(HexOfRGB(BoxCenter, BoxCenter, BoxCenter), BoxWithDuplicate)).toBe(true)
})

test('IsInsideRegion treats a single-point region as an exact-match test (matching case)', () => {
  expect(IsInsideRegion('#808080', ['#808080'])).toBe(true)
})

test('IsInsideRegion treats a single-point region as an exact-match test (non-matching case)', () => {
  expect(IsInsideRegion('#808081', ['#808080'])).toBe(false)
})

test('IsInsideRegion rejects an empty RegionPoints array', () => {
  expect(() => IsInsideRegion('#808080', [])).toThrow(RangeError)
})

test('IsInsideRegion rejects a malformed color inside RegionPoints', () => {
  expect(() => IsInsideRegion('#808080', ['#zzzzzz'])).toThrow()
})

test('IsInsideRegion rejects a malformed ComparePointHex', () => {
  expect(() => IsInsideRegion('#zzzzzz', Box)).toThrow()
})

test('IsInsideRegion accepts a point on a 3-point collinear region', () => {
  expect(IsInsideRegion('#646464', ['#000000', '#0a0a0a', '#c8c8c8'])).toBe(true)
})

test('IsInsideRegion rejects a point off a 3-point collinear region', () => {
  expect(IsInsideRegion('#ff0000', ['#000000', '#0a0a0a', '#c8c8c8'])).toBe(false)
})

// Section G: exact-boundary vs just-outside membership (Epsilon vs 1-unit hex granularity)
const BoxFaceBoundaryCases: readonly [number, number, number, boolean][] = [
  [BoxMin, BoxCenter, BoxCenter, true], [BoxMin - 1, BoxCenter, BoxCenter, false],
  [BoxMax, BoxCenter, BoxCenter, true], [BoxMax + 1, BoxCenter, BoxCenter, false],
  [BoxCenter, BoxMin, BoxCenter, true], [BoxCenter, BoxMin - 1, BoxCenter, false],
  [BoxCenter, BoxMax, BoxCenter, true], [BoxCenter, BoxMax + 1, BoxCenter, false],
  [BoxCenter, BoxCenter, BoxMin, true], [BoxCenter, BoxCenter, BoxMin - 1, false],
  [BoxCenter, BoxCenter, BoxMax, true], [BoxCenter, BoxCenter, BoxMax + 1, false],
]

for (const [R, G, B, Expected] of BoxFaceBoundaryCases) {
  test(`IsInsideRegion of box face boundary at R=${R} G=${G} B=${B} is ${Expected}`, () => {
    expect(IsInsideRegion(HexOfRGB(R, G, B), Box)).toBe(Expected)
  })
}

// Section H: RegionCentroidRatio closed-form check for an axis-aligned box (Ratio = 1 - Delta/HalfExtent along a single axis)
const BoxCentroidDeltas: readonly number[] = [0, 25, 50, 75, 76, 100, 125]

for (const Delta of BoxCentroidDeltas) {
  const Expected = Delta <= BoxHalfExtent ? 1 - Delta / BoxHalfExtent : -1

  test(`RegionCentroidRatio of box at R-Delta=${Delta} is ${Expected.toFixed(4)}`, () => {
    expect(RegionCentroidRatio(HexOfRGB(BoxCenter + Delta, BoxCenter, BoxCenter), Box)).toBeCloseTo(Expected, 6)
  })

  test(`RegionCentroidRatio of box at G-Delta=${Delta} is ${Expected.toFixed(4)}`, () => {
    expect(RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter + Delta, BoxCenter), Box)).toBeCloseTo(Expected, 6)
  })

  test(`RegionCentroidRatio of box at B-Delta=${Delta} is ${Expected.toFixed(4)}`, () => {
    expect(RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter, BoxCenter + Delta), Box)).toBeCloseTo(Expected, 6)
  })
}

// Section I: RegionCentroidRatio for the line, rectangle, and pyramid shapes
test('RegionCentroidRatio is 1 at the line midpoint centroid', () => {
  expect(RegionCentroidRatio('#320000', Line)).toBe(1)
})

test('RegionCentroidRatio is 0 at the line start endpoint', () => {
  expect(RegionCentroidRatio('#000000', Line)).toBeCloseTo(0, 6)
})

test('RegionCentroidRatio is 0 at the line end endpoint', () => {
  expect(RegionCentroidRatio('#640000', Line)).toBeCloseTo(0, 6)
})

test('RegionCentroidRatio is -1 beyond the line end', () => {
  expect(RegionCentroidRatio('#960000', Line)).toBe(-1)
})

test('RegionCentroidRatio is -1 off the line entirely', () => {
  expect(RegionCentroidRatio('#32000a', Line)).toBe(-1)
})

test('RegionCentroidRatio is 1 at the rectangle centroid', () => {
  expect(RegionCentroidRatio('#7d7d00', Square)).toBe(1)
})

test('RegionCentroidRatio is 0 at a rectangle corner', () => {
  expect(RegionCentroidRatio('#323200', Square)).toBeCloseTo(0, 6)
})

test('RegionCentroidRatio is 0 on a rectangle edge midpoint', () => {
  expect(RegionCentroidRatio('#7d3200', Square)).toBeCloseTo(0, 6)
})

test('RegionCentroidRatio is -1 outside the rectangle', () => {
  expect(RegionCentroidRatio('#000000', Square)).toBe(-1)
})

test('RegionCentroidRatio is -1 off the rectangle plane at its own centroid position', () => {
  expect(RegionCentroidRatio('#7d7d05', Square)).toBe(-1)
})

test('RegionCentroidRatio is 1 at the pyramid volume centroid', () => {
  expect(RegionCentroidRatio('#646432', Pyramid)).toBe(1)
})

test('RegionCentroidRatio is 0 at a pyramid vertex', () => {
  expect(RegionCentroidRatio('#000000', Pyramid)).toBeCloseTo(0, 6)
})

test('RegionCentroidRatio is -1 beyond the pyramid bounding box', () => {
  expect(RegionCentroidRatio('#ffffff', Pyramid)).toBe(-1)
})

test('RegionCentroidRatio is strictly between -1 and 1 at the pyramid base-square average (not the volume centroid)', () => {
  const Ratio = RegionCentroidRatio('#646400', Pyramid)
  expect(Ratio > -1 && Ratio < 1).toBe(true)
})

test('RegionCentroidRatio is -1 for a rectangle corner offset outside the plane', () => {
  expect(RegionCentroidRatio('#c8c805', Square)).toBe(-1)
})

// Section J: monotonic decrease from centroid towards the boundary
test('RegionCentroidRatio decreases monotonically along the R axis (20 -> 40 -> 60)', () => {
  const Near = RegionCentroidRatio(HexOfRGB(BoxCenter + 20, BoxCenter, BoxCenter), Box)
  const Middle = RegionCentroidRatio(HexOfRGB(BoxCenter + 40, BoxCenter, BoxCenter), Box)
  const Far = RegionCentroidRatio(HexOfRGB(BoxCenter + 60, BoxCenter, BoxCenter), Box)
  expect(Near > Middle).toBe(true)
  expect(Middle > Far).toBe(true)
})

test('RegionCentroidRatio decreases monotonically along the G axis (20 -> 40 -> 60)', () => {
  const Near = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter + 20, BoxCenter), Box)
  const Middle = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter + 40, BoxCenter), Box)
  const Far = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter + 60, BoxCenter), Box)
  expect(Near > Middle).toBe(true)
  expect(Middle > Far).toBe(true)
})

test('RegionCentroidRatio decreases monotonically along the B axis (20 -> 40 -> 60)', () => {
  const Near = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter, BoxCenter + 20), Box)
  const Middle = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter, BoxCenter + 40), Box)
  const Far = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter, BoxCenter + 60), Box)
  expect(Near > Middle).toBe(true)
  expect(Middle > Far).toBe(true)
})

test('RegionCentroidRatio decreases monotonically along a diagonal direction (near -> mid)', () => {
  const Near = RegionCentroidRatio(HexOfRGB(BoxCenter + 20, BoxCenter + 20, BoxCenter + 20), Box)
  const Mid = RegionCentroidRatio(HexOfRGB(BoxCenter + 40, BoxCenter + 40, BoxCenter + 40), Box)
  expect(Near > Mid).toBe(true)
})

test('RegionCentroidRatio decreases monotonically along a diagonal direction (mid -> far)', () => {
  const Mid = RegionCentroidRatio(HexOfRGB(BoxCenter + 40, BoxCenter + 40, BoxCenter + 40), Box)
  const Far = RegionCentroidRatio(HexOfRGB(BoxCenter + 60, BoxCenter + 60, BoxCenter + 60), Box)
  expect(Mid > Far).toBe(true)
})

// Section K: near-boundary precision and a globally-extreme (0-254) box
const NearBoundaryDeltas: readonly [number, boolean][] = [[74, true], [76, false]]

for (const [Delta, ExpectPositive] of NearBoundaryDeltas) {
  test(`RegionCentroidRatio of box at R-Delta=${Delta} is ${ExpectPositive ? 'positive' : '-1'}`, () => {
    const Ratio = RegionCentroidRatio(HexOfRGB(BoxCenter + Delta, BoxCenter, BoxCenter), Box)
    expect(ExpectPositive ? Ratio > 0 : Ratio === -1).toBe(true)
  })

  test(`RegionCentroidRatio of box at G-Delta=${Delta} is ${ExpectPositive ? 'positive' : '-1'}`, () => {
    const Ratio = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter + Delta, BoxCenter), Box)
    expect(ExpectPositive ? Ratio > 0 : Ratio === -1).toBe(true)
  })

  test(`RegionCentroidRatio of box at B-Delta=${Delta} is ${ExpectPositive ? 'positive' : '-1'}`, () => {
    const Ratio = RegionCentroidRatio(HexOfRGB(BoxCenter, BoxCenter, BoxCenter + Delta), Box)
    expect(ExpectPositive ? Ratio > 0 : Ratio === -1).toBe(true)
  })
}

const FullRangeBox: string[] = [
  '#000000', '#fe0000', '#00fe00', '#0000fe',
  '#fefe00', '#fe00fe', '#00fefe', '#fefefe',
]
const FullRangeCenter = 127
const FullRangeHalfExtent = 127

test('RegionCentroidRatio is 0 exactly at the half-extent of a full-range (0-254) box', () => {
  expect(RegionCentroidRatio(HexOfRGB(FullRangeCenter + FullRangeHalfExtent, FullRangeCenter, FullRangeCenter), FullRangeBox)).toBeCloseTo(0, 3)
})

test('RegionCentroidRatio is positive just inside the half-extent of a full-range (0-254) box', () => {
  expect(RegionCentroidRatio(HexOfRGB(FullRangeCenter + FullRangeHalfExtent - 1, FullRangeCenter, FullRangeCenter), FullRangeBox) > 0).toBe(true)
})

test('RegionCentroidRatio is -1 just outside the half-extent of a full-range (0-254) box', () => {
  expect(RegionCentroidRatio(HexOfRGB(FullRangeCenter + FullRangeHalfExtent + 1, FullRangeCenter, FullRangeCenter), FullRangeBox)).toBe(-1)
})
