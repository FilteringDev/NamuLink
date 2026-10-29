import { test, expect } from 'vitest'
import { ParseHexColor, HexDistance, HexRelativeLuminance, HexContrastRatio, IsReadableTextColor, TextReadabilityScore } from '@userscript/coloring/coloring.js'

// Independent restatements of the WCAG formulas (not imports from coloring.ts) so these tests can catch regressions in the implementation.
function LinearizeChannelForExpectation(Channel: number): number {
  const Normalized = Channel / 255
  return Normalized <= 0.04045 ? Normalized / 12.92 : ((Normalized + 0.055) / 1.055) ** 2.4
}

function ExpectedLuminance(R: number, G: number, B: number): number {
  return 0.2126 * LinearizeChannelForExpectation(R) + 0.7152 * LinearizeChannelForExpectation(G) + 0.0722 * LinearizeChannelForExpectation(B)
}

function ExpectedContrastRatio(TextGray: number, BackgroundGray: number): number {
  const TextLuminance = ExpectedLuminance(TextGray, TextGray, TextGray)
  const BackgroundLuminance = ExpectedLuminance(BackgroundGray, BackgroundGray, BackgroundGray)
  const Lighter = Math.max(TextLuminance, BackgroundLuminance)
  const Darker = Math.min(TextLuminance, BackgroundLuminance)
  return (Lighter + 0.05) / (Darker + 0.05)
}

function HexOfGray(Gray: number): string {
  return `#${Array(3).fill(Gray.toString(16).padStart(2, '0')).join('')}`
}

// Section A: ParseHexColor valid forms
const ValidParseHexColorCases: readonly [string, [number, number, number]][] = [
  ['#fff', [255, 255, 255]],
  ['fff', [255, 255, 255]],
  ['#ffffff', [255, 255, 255]],
  ['ffffff', [255, 255, 255]],
  ['#000', [0, 0, 0]],
  ['000000', [0, 0, 0]],
  ['#1a2b3c', [26, 43, 60]],
  ['#1A2B3C', [26, 43, 60]],
  ['#FfAaBb', [255, 170, 187]],
  ['abc', [170, 187, 204]],
  ['#010203', [1, 2, 3]],
  ['#800000', [128, 0, 0]],
  ['#008000', [0, 128, 0]],
  ['#000080', [0, 0, 128]],
  ['#ff0000', [255, 0, 0]],
  ['#00ff00', [0, 255, 0]],
  ['#0000ff', [0, 0, 255]],
  ['#123', [17, 34, 51]],
  ['#c0ffee', [192, 255, 238]],
  ['#deadbe', [222, 173, 190]],
  ['#00ffff', [0, 255, 255]],
  ['#ff00ff', [255, 0, 255]],
  ['#ffff00', [255, 255, 0]],
  ['#ff0080', [255, 0, 128]],
  ['#800080', [128, 0, 128]],
  ['#7f7f7f', [127, 127, 127]],
]

for (const [Input, Expected] of ValidParseHexColorCases) {
  test(`ParseHexColor parses "${Input}" as [${Expected.join(', ')}]`, () => {
    expect(ParseHexColor(Input)).toEqual(Expected)
  })
}

// Section B: ParseHexColor invalid forms
const InvalidParseHexColorCases: readonly string[] = [
  '', '#', '#12', '#1234', '#12345', '#1234567', '12', '1234',
  '#gggggg', '#zzzzzz', '#gg0000', '#12 45', '##ffffff', '#ff', 'ffffffff', '#ffffffff',
]

for (const Input of InvalidParseHexColorCases) {
  test(`ParseHexColor rejects "${Input}"`, () => {
    expect(() => ParseHexColor(Input)).toThrow()
  })
}

// Section C: HexDistance
test('HexDistance of a 16-unit difference on R alone is 16', () => {
  expect(HexDistance('#100000', '#200000')).toBe(16)
})

test('HexDistance of a 32-unit difference on G alone is 32', () => {
  expect(HexDistance('#001000', '#003000')).toBe(32)
})

test('HexDistance of a 64-unit difference on B alone is 64', () => {
  expect(HexDistance('#000010', '#000050')).toBe(64)
})

test('HexDistance is zero for an identical color pair', () => {
  expect(HexDistance('#123456', '#123456')).toBe(0)
})

test('HexDistance matches the 3-4-5 Pythagorean triple', () => {
  expect(HexDistance('#000000', '#030400')).toBe(5)
})

test('HexDistance matches the 6-8-10 Pythagorean triple', () => {
  expect(HexDistance('#000000', '#060800')).toBe(10)
})

test('HexDistance matches the 5-12-13 Pythagorean triple', () => {
  expect(HexDistance('#000000', '#050c00')).toBe(13)
})

test('HexDistance matches the 2-3-6 Pythagorean triple across all three channels', () => {
  expect(HexDistance('#000000', '#020306')).toBe(7)
})

test('HexDistance matches the 1-2-2 Pythagorean triple', () => {
  expect(HexDistance('#000000', '#010202')).toBe(3)
})

test('HexDistance matches the 2-6-9 Pythagorean triple', () => {
  expect(HexDistance('#000000', '#020609')).toBe(11)
})

test('HexDistance matches the 4-4-7 Pythagorean triple', () => {
  expect(HexDistance('#000000', '#040407')).toBe(9)
})

test('HexDistance matches the 6-6-7 Pythagorean triple', () => {
  expect(HexDistance('#000000', '#060607')).toBe(11)
})

test('HexDistance is symmetric for an arbitrary color pair', () => {
  expect(HexDistance('#123456', '#abcdef')).toBe(HexDistance('#abcdef', '#123456'))
})

test('HexDistance is symmetric for a magenta/black pair', () => {
  expect(HexDistance('#000000', '#ff00ff')).toBe(HexDistance('#ff00ff', '#000000'))
})

test('HexDistance of black to magenta matches the two-axis diagonal formula', () => {
  expect(HexDistance('#000000', '#ff00ff')).toBeCloseTo(Math.sqrt(255 ** 2 * 2), 9)
})

// Section D: HexRelativeLuminance
const GrayValuesForLuminance: readonly number[] = [0, 1, 2, 10, 11, 16, 32, 64, 85, 127, 128, 160, 200, 224, 239, 240, 250, 254, 255]

for (const Gray of GrayValuesForLuminance) {
  test(`HexRelativeLuminance of gray ${Gray} matches the WCAG formula`, () => {
    expect(HexRelativeLuminance(HexOfGray(Gray))).toBeCloseTo(ExpectedLuminance(Gray, Gray, Gray), 9)
  })
}

test('HexRelativeLuminance ranks pure green above pure red at value 200', () => {
  expect(HexRelativeLuminance('#00c800') > HexRelativeLuminance('#c80000')).toBe(true)
})

test('HexRelativeLuminance ranks pure red above pure blue at value 200', () => {
  expect(HexRelativeLuminance('#c80000') > HexRelativeLuminance('#0000c8')).toBe(true)
})

test('HexRelativeLuminance ranks pure green above pure red at value 100', () => {
  expect(HexRelativeLuminance('#006400') > HexRelativeLuminance('#640000')).toBe(true)
})

test('HexRelativeLuminance ranks pure red above pure blue at value 100', () => {
  expect(HexRelativeLuminance('#640000') > HexRelativeLuminance('#000064')).toBe(true)
})

// Section E: HexContrastRatio
const GrayPairsForContrast: readonly [number, number][] = [
  [0, 255], [255, 0], [50, 200], [200, 50], [100, 100],
  [10, 11], [11, 10], [0, 128], [128, 255], [64, 192],
  [192, 64], [30, 220], [220, 30], [0, 0], [255, 255],
  [118, 255], [119, 255], [69, 255], [255, 69], [150, 5],
]

for (const [TextGray, BackgroundGray] of GrayPairsForContrast) {
  test(`HexContrastRatio of gray ${TextGray} on gray ${BackgroundGray} matches the WCAG formula`, () => {
    expect(HexContrastRatio(HexOfGray(TextGray), HexOfGray(BackgroundGray))).toBeCloseTo(ExpectedContrastRatio(TextGray, BackgroundGray), 9)
  })
}

// Section F: IsReadableTextColor
const TextGraysForReadability: readonly number[] = [0, 32, 64, 96, 128, 160, 192, 224, 255]

for (const TextGray of TextGraysForReadability) {
  test(`IsReadableTextColor of gray ${TextGray} on white matches the default AA threshold`, () => {
    expect(IsReadableTextColor(HexOfGray(TextGray), '#ffffff')).toBe(ExpectedContrastRatio(TextGray, 255) >= 4.5)
  })

  test(`IsReadableTextColor of gray ${TextGray} on black matches the default AA threshold`, () => {
    expect(IsReadableTextColor(HexOfGray(TextGray), '#000000')).toBe(ExpectedContrastRatio(TextGray, 0) >= 4.5)
  })

  test(`IsReadableTextColor of gray ${TextGray} on white with LargeText matches the AA-Large threshold`, () => {
    expect(IsReadableTextColor(HexOfGray(TextGray), '#ffffff', { LargeText: true })).toBe(ExpectedContrastRatio(TextGray, 255) >= 3)
  })

  test(`IsReadableTextColor of gray ${TextGray} on white with Enhanced matches the AAA threshold`, () => {
    expect(IsReadableTextColor(HexOfGray(TextGray), '#ffffff', { Enhanced: true })).toBe(ExpectedContrastRatio(TextGray, 255) >= 7)
  })
}

// Section G: TextReadabilityScore
for (const [TextGray, BackgroundGray] of GrayPairsForContrast.slice(0, 18)) {
  test(`TextReadabilityScore of gray ${TextGray} on gray ${BackgroundGray} normalizes the contrast ratio`, () => {
    expect(TextReadabilityScore(HexOfGray(TextGray), HexOfGray(BackgroundGray))).toBeCloseTo((ExpectedContrastRatio(TextGray, BackgroundGray) - 1) / 20, 9)
  })
}

// Section H: malformed HEX input across all functions
test('HexDistance rejects a malformed first argument', () => {
  expect(() => HexDistance('#zzzzzz', '#ffffff')).toThrow()
})

test('HexDistance rejects a malformed second argument', () => {
  expect(() => HexDistance('#ffffff', '#zzzzzz')).toThrow()
})

test('HexRelativeLuminance rejects a short HEX string', () => {
  expect(() => HexRelativeLuminance('#12345')).toThrow()
})

test('HexRelativeLuminance rejects an empty string', () => {
  expect(() => HexRelativeLuminance('')).toThrow()
})

test('HexContrastRatio rejects a malformed first argument', () => {
  expect(() => HexContrastRatio('#zzzzzz', '#ffffff')).toThrow()
})

test('HexContrastRatio rejects a malformed second argument', () => {
  expect(() => HexContrastRatio('#ffffff', '#zzzzzz')).toThrow()
})

test('HexContrastRatio rejects an empty first argument', () => {
  expect(() => HexContrastRatio('', '#ffffff')).toThrow()
})

test('IsReadableTextColor rejects a malformed first argument', () => {
  expect(() => IsReadableTextColor('#zzzzzz', '#ffffff')).toThrow()
})

test('IsReadableTextColor rejects a malformed second argument', () => {
  expect(() => IsReadableTextColor('#ffffff', '#zzzzzz')).toThrow()
})

test('IsReadableTextColor rejects a too-short first argument', () => {
  expect(() => IsReadableTextColor('#12', '#ffffff')).toThrow()
})

test('TextReadabilityScore rejects a malformed first argument', () => {
  expect(() => TextReadabilityScore('#zzzzzz', '#ffffff')).toThrow()
})

test('TextReadabilityScore rejects a malformed second argument', () => {
  expect(() => TextReadabilityScore('#ffffff', '#zzzzzz')).toThrow()
})

test('TextReadabilityScore rejects two empty arguments', () => {
  expect(() => TextReadabilityScore('', '')).toThrow()
})

test('HexDistance rejects two empty arguments', () => {
  expect(() => HexDistance('', '')).toThrow()
})

test('HexRelativeLuminance rejects invalid hex characters', () => {
  expect(() => HexRelativeLuminance('#gggggg')).toThrow()
})

test('HexContrastRatio rejects a mismatched-length second argument', () => {
  expect(() => HexContrastRatio('#123456', '#12345')).toThrow()
})
