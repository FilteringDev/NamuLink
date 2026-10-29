export type RGB = readonly [number, number, number]

type Facet = {
  Normal: RGB
  Offset: number
}

type Face = Facet & {
  Vertices: RGB[]
}

type AffineBasis = {
  Origin: RGB
  Basis: RGB[]
}

const Epsilon = 1e-6

export type TextReadabilityOptions = {
  LargeText?: boolean
  Enhanced?: boolean
}

/** Parses `#RGB`/`#RRGGBB` (with or without leading `#`) into 0-255 RGB components. */
export function ParseHexColor(Hex: string): RGB {
  const Normalized = Hex.startsWith('#') ? Hex.slice(1) : Hex
  const Expanded = Normalized.length === 3
    ? Normalized.split('').map(Char => Char + Char).join('')
    : Normalized

  if (!/^[0-9a-fA-F]{6}$/.test(Expanded)) throw new RangeError(`Invalid hex color: ${Hex}`)

  return [
    Number.parseInt(Expanded.slice(0, 2), 16),
    Number.parseInt(Expanded.slice(2, 4), 16),
    Number.parseInt(Expanded.slice(4, 6), 16),
  ]
}

function ParseRgbChannel(Value: string, Original: string): number {
  const Trimmed = Value.trim()
  if (Trimmed.endsWith('%')) {
    const Percent = Number(Trimmed.slice(0, -1).trim())
    if (!Number.isFinite(Percent) || Percent < 0 || Percent > 100) throw new RangeError(`Invalid rgb color: ${Original}`)
    return Math.round((Percent / 100) * 255)
  }

  const Channel = Number(Trimmed)
  if (!Number.isFinite(Channel) || Channel < 0 || Channel > 255) throw new RangeError(`Invalid rgb color: ${Original}`)
  return Math.round(Channel)
}

function ParseAlphaChannel(Value: string, Original: string): void {
  const Trimmed = Value.trim()
  const Alpha = Trimmed.endsWith('%')
    ? Number(Trimmed.slice(0, -1).trim())
    : Number(Trimmed)
  const Max = Trimmed.endsWith('%') ? 100 : 1
  if (!Number.isFinite(Alpha) || Alpha < 0 || Alpha > Max) throw new RangeError(`Invalid rgb color: ${Original}`)
}

function ParseRgbColor(Color: string): RGB {
  const FunctionMatch = Color.trim().match(/^rgba?\s*\(\s*(.+?)\s*\)$/i)
  if (!FunctionMatch) throw new RangeError(`Invalid color: ${Color}`)
  const Original = Color
  const Inner = FunctionMatch[1]

  if (Inner.includes('/')) {
    const [RgbPart, AlphaPart] = Inner.split('/')
    if (AlphaPart === undefined || RgbPart.includes(',')) throw new RangeError(`Invalid rgb color: ${Original}`)
    const Channels = RgbPart.trim().split(/\s+/).filter(Part => Part.length > 0)
    if (Channels.length !== 3) throw new RangeError(`Invalid rgb color: ${Original}`)
    ParseAlphaChannel(AlphaPart, Original)
    return [ParseRgbChannel(Channels[0], Original), ParseRgbChannel(Channels[1], Original), ParseRgbChannel(Channels[2], Original)]
  }

  if (Inner.includes(',')) {
    const Parts = Inner.split(',').map(Part => Part.trim())
    if (Parts.length !== 3 && Parts.length !== 4) throw new RangeError(`Invalid rgb color: ${Original}`)
    if (Parts.some(Part => Part.length === 0)) throw new RangeError(`Invalid rgb color: ${Original}`)
    if (Parts.length === 4) ParseAlphaChannel(Parts[3], Original)
    return [ParseRgbChannel(Parts[0], Original), ParseRgbChannel(Parts[1], Original), ParseRgbChannel(Parts[2], Original)]
  }

  const Channels = Inner.split(/\s+/).filter(Part => Part.length > 0)
  if (Channels.length !== 3) throw new RangeError(`Invalid rgb color: ${Original}`)
  return [ParseRgbChannel(Channels[0], Original), ParseRgbChannel(Channels[1], Original), ParseRgbChannel(Channels[2], Original)]
}

/** Parses HEX (`#RGB`/`#RRGGBB`) or `rgb()`/`rgba()` (comma or space syntax, alpha is ignored) into 0-255 RGB components. */
export function ParseCssColor(Color: string): RGB {
  const Trimmed = Color.trim()
  if (Trimmed.toLowerCase() === 'transparent') return [0, 0, 0]
  if (/^rgba?\s*\(/i.test(Trimmed)) return ParseRgbColor(Trimmed)
  return ParseHexColor(Trimmed)
}

function Subtract(A: RGB, B: RGB): RGB {
  return [A[0] - B[0], A[1] - B[1], A[2] - B[2]]
}

function Add(A: RGB, B: RGB): RGB {
  return [A[0] + B[0], A[1] + B[1], A[2] + B[2]]
}

function Scale(A: RGB, Factor: number): RGB {
  return [A[0] * Factor, A[1] * Factor, A[2] * Factor]
}

function Dot(A: RGB, B: RGB): number {
  return A[0] * B[0] + A[1] * B[1] + A[2] * B[2]
}

function Cross(A: RGB, B: RGB): RGB {
  return [
    A[1] * B[2] - A[2] * B[1],
    A[2] * B[0] - A[0] * B[2],
    A[0] * B[1] - A[1] * B[0],
  ]
}

function Length(A: RGB): number {
  return Math.hypot(A[0], A[1], A[2])
}

function Normalize(A: RGB): RGB {
  const Magnitude = Length(A)
  return Magnitude < Epsilon ? [0, 0, 0] : Scale(A, 1 / Magnitude)
}

function PointAverage(Points: RGB[]): RGB {
  const Sum = Points.reduce<RGB>((Total, Point) => Add(Total, Point), [0, 0, 0])
  return Scale(Sum, 1 / Points.length)
}

/** Euclidean RGB-cube distance between two CSS colors (0 = identical, ~441.67 = black/white). */
export function HexDistance(ColorA: string, ColorB: string): number {
  return Length(Subtract(ParseCssColor(ColorA), ParseCssColor(ColorB)))
}

function LinearizeSrgbChannel(Channel: number): number {
  const Normalized = Channel / 255
  return Normalized <= 0.04045 ? Normalized / 12.92 : ((Normalized + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance for a CSS color (0 = black, 1 = white). */
export function HexRelativeLuminance(Color: string): number {
  const [Red, Green, Blue] = ParseCssColor(Color)
  return 0.2126 * LinearizeSrgbChannel(Red)
    + 0.7152 * LinearizeSrgbChannel(Green)
    + 0.0722 * LinearizeSrgbChannel(Blue)
}

/** WCAG contrast ratio between text and background colors (1 = identical, 21 = black/white). */
export function HexContrastRatio(TextColor: string, BackgroundColor: string): number {
  const TextLuminance = HexRelativeLuminance(TextColor)
  const BackgroundLuminance = HexRelativeLuminance(BackgroundColor)
  const Lighter = Math.max(TextLuminance, BackgroundLuminance)
  const Darker = Math.min(TextLuminance, BackgroundLuminance)
  return (Lighter + 0.05) / (Darker + 0.05)
}

/** Whether a text/background color pair satisfies WCAG contrast guidance. */
export function IsReadableTextColor(TextColor: string, BackgroundColor: string, Options: TextReadabilityOptions = {}): boolean {
  const RequiredRatio = Options.Enhanced
    ? Options.LargeText ? 4.5 : 7
    : Options.LargeText ? 3 : 4.5
  return HexContrastRatio(TextColor, BackgroundColor) >= RequiredRatio
}

/** Normalized text readability score based on WCAG contrast ratio (0 = identical, 1 = black/white). */
export function TextReadabilityScore(TextColor: string, BackgroundColor: string): number {
  return (HexContrastRatio(TextColor, BackgroundColor) - 1) / 20
}

// Gram-Schmidt against Points[0]; Basis.length is the affine rank (0-3) of the point set.
function DetectAffineBasis(Points: RGB[]): AffineBasis {
  const Origin = Points[0]
  const Basis: RGB[] = []

  for (const Point of Points.slice(1)) {
    if (Basis.length === 3) break
    let Residual = Subtract(Point, Origin)
    for (const BasisVector of Basis) Residual = Subtract(Residual, Scale(BasisVector, Dot(Residual, BasisVector)))
    if (Length(Residual) > Epsilon) Basis.push(Normalize(Residual))
  }

  return { Origin, Basis }
}

// Distance from Point to the line/plane/volume spanned by AffineBasisResult (0 when Point lies within it).
function ResidualDistance(Point: RGB, AffineBasisResult: AffineBasis): number {
  let Residual = Subtract(Point, AffineBasisResult.Origin)
  for (const BasisVector of AffineBasisResult.Basis) Residual = Subtract(Residual, Scale(BasisVector, Dot(Residual, BasisVector)))
  return Length(Residual)
}

function Cross2D(Origin: readonly [number, number], A: readonly [number, number], B: readonly [number, number]): number {
  return (A[0] - Origin[0]) * (B[1] - Origin[1]) - (A[1] - Origin[1]) * (B[0] - Origin[0])
}

// Andrew's monotone chain; returns hull points in counter-clockwise order.
function ConvexHull2D(Points: (readonly [number, number])[]): (readonly [number, number])[] {
  const Sorted = Points.toSorted((A, B) => A[0] - B[0] || A[1] - B[1])
  if (Sorted.length < 3) return Sorted

  const BuildHalf = (Input: (readonly [number, number])[]): (readonly [number, number])[] => {
    const Half: (readonly [number, number])[] = []
    for (const Point of Input) {
      while (Half.length >= 2 && Cross2D(Half[Half.length - 2], Half[Half.length - 1], Point) <= 0) Half.pop()
      Half.push(Point)
    }
    return Half
  }

  const Lower = BuildHalf(Sorted)
  const Upper = BuildHalf(Sorted.toReversed())
  return [...Lower.slice(0, -1), ...Upper.slice(0, -1)]
}

function PointKey(Point: RGB): string {
  return `${Point[0]},${Point[1]},${Point[2]}`
}

function ComputeFaces3D(Points: RGB[]): Face[] {
  const PointKeys = new Set<string>()
  const UniquePoints = Points.filter(Point => {
    const Key = PointKey(Point)
    if (PointKeys.has(Key)) return false
    PointKeys.add(Key)
    return true
  })
  const InteriorPoint = PointAverage(UniquePoints)
  const Faces: Face[] = []
  const FaceKeys = new Set<string>()

  for (let I = 0; I < UniquePoints.length; I++) {
    for (let J = I + 1; J < UniquePoints.length; J++) {
      for (let K = J + 1; K < UniquePoints.length; K++) {
        const NormalCandidate = Cross(Subtract(UniquePoints[J], UniquePoints[I]), Subtract(UniquePoints[K], UniquePoints[I]))
        if (Length(NormalCandidate) < Epsilon) continue

        const Offset = Dot(NormalCandidate, UniquePoints[I])
        const InteriorSide = Dot(NormalCandidate, InteriorPoint) - Offset
        const Normal = InteriorSide > 0 ? Scale(NormalCandidate, -1) : NormalCandidate
        const OutwardOffset = InteriorSide > 0 ? -Offset : Offset
        if (!UniquePoints.every(Point => Dot(Normal, Point) <= OutwardOffset + Epsilon)) continue

        const Vertices = UniquePoints.filter(Point => Math.abs(Dot(Normal, Point) - OutwardOffset) <= Epsilon)
        const FaceKey = Vertices.map(PointKey).toSorted().join('|')
        if (FaceKeys.has(FaceKey)) continue
        FaceKeys.add(FaceKey)

        const FaceCenter = PointAverage(Vertices)
        const AxisA = Normalize(Subtract(Vertices[0], FaceCenter))
        const AxisB = Normalize(Cross(Normal, AxisA))
        const OrderedVertices = Vertices.toSorted((A, B) => Math.atan2(Dot(Subtract(A, FaceCenter), AxisB), Dot(Subtract(A, FaceCenter), AxisA))
          - Math.atan2(Dot(Subtract(B, FaceCenter), AxisB), Dot(Subtract(B, FaceCenter), AxisA)))
        Faces.push({ Normal, Offset: OutwardOffset, Vertices: OrderedVertices })
      }
    }
  }

  return Faces
}

function GeometricCentroid(Points: RGB[], AffineBasisResult: AffineBasis): RGB {
  const { Origin, Basis } = AffineBasisResult
  if (Basis.length === 0) return Origin

  if (Basis.length === 1) {
    const [Direction] = Basis
    const Projections = Points.map(Point => Dot(Subtract(Point, Origin), Direction))
    return Add(Origin, Scale(Direction, (Math.min(...Projections) + Math.max(...Projections)) / 2))
  }

  if (Basis.length === 2) {
    const [DirectionA, DirectionB] = Basis
    const Hull = ConvexHull2D(Points.map(Point => {
      const Relative = Subtract(Point, Origin)
      return [Dot(Relative, DirectionA), Dot(Relative, DirectionB)] as const
    }))
    let TwiceArea = 0
    let WeightedX = 0
    let WeightedY = 0
    for (let Index = 0; Index < Hull.length; Index++) {
      const Current = Hull[Index]
      const Next = Hull[(Index + 1) % Hull.length]
      const CrossValue = Current[0] * Next[1] - Next[0] * Current[1]
      TwiceArea += CrossValue
      WeightedX += (Current[0] + Next[0]) * CrossValue
      WeightedY += (Current[1] + Next[1]) * CrossValue
    }
    if (Math.abs(TwiceArea) < Epsilon) return PointAverage(Points)
    return Add(Origin, Add(Scale(DirectionA, WeightedX / (3 * TwiceArea)), Scale(DirectionB, WeightedY / (3 * TwiceArea))))
  }

  let SignedVolume = 0
  let VolumeMoment: RGB = [0, 0, 0]
  for (const FaceValue of ComputeFaces3D(Points)) {
    const [First, ...Remaining] = FaceValue.Vertices
    for (let Index = 0; Index < Remaining.length - 1; Index++) {
      const Second = Remaining[Index]
      const Third = Remaining[Index + 1]
      const TetrahedronVolume = Dot(First, Cross(Second, Third)) / 6
      SignedVolume += TetrahedronVolume
      VolumeMoment = Add(VolumeMoment, Scale(Add(Add(First, Second), Third), TetrahedronVolume / 4))
    }
  }

  return Math.abs(SignedVolume) < Epsilon ? PointAverage(Points) : Scale(VolumeMoment, 1 / SignedVolume)
}

function ComputeFacets(Points: RGB[], AffineBasisResult: AffineBasis): Facet[] {
  const { Origin, Basis } = AffineBasisResult

  if (Basis.length === 0) return []

  if (Basis.length === 1) {
    const [Direction] = Basis
    const Projections = Points.map(Point => Dot(Subtract(Point, Origin), Direction))
    const MinProjection = Math.min(...Projections)
    const MaxProjection = Math.max(...Projections)
    return [
      { Normal: Direction, Offset: Dot(Direction, Origin) + MaxProjection },
      { Normal: Scale(Direction, -1), Offset: -(Dot(Direction, Origin) + MinProjection) },
    ]
  }

  if (Basis.length === 2) {
    const [DirectionA, DirectionB] = Basis
    const Projected2D = Points.map((Point): [number, number] => {
      const Relative = Subtract(Point, Origin)
      return [Dot(Relative, DirectionA), Dot(Relative, DirectionB)]
    })
    const Hull2D = ConvexHull2D(Projected2D)

    return Hull2D.map((Vertex, Index): Facet => {
      const Next = Hull2D[(Index + 1) % Hull2D.length]
      const Edge: [number, number] = [Next[0] - Vertex[0], Next[1] - Vertex[1]]
      const Normal2D: [number, number] = [Edge[1], -Edge[0]]
      const Normal3D = Add(Scale(DirectionA, Normal2D[0]), Scale(DirectionB, Normal2D[1]))
      const Offset2D = Normal2D[0] * Vertex[0] + Normal2D[1] * Vertex[1]
      return { Normal: Normal3D, Offset: Dot(Normal3D, Origin) + Offset2D }
    })
  }

  // Rank 3: enumerate the small expected point sets, grouping coplanar triples into faces.
  return ComputeFaces3D(Points)
}

/** Whether ComparePoint lies within (or on the boundary of) the convex hull of RegionPoints. */
export function IsInsideRegion(ComparePoint: string, RegionPoints: string[]): boolean {
  if (RegionPoints.length === 0) throw new RangeError('RegionPoints must contain at least one color')

  const Points = RegionPoints.map(ParseCssColor)
  const ComparePointRgb = ParseCssColor(ComparePoint)
  const AffineBasisResult = DetectAffineBasis(Points)

  if (ResidualDistance(ComparePointRgb, AffineBasisResult) > Epsilon) return false

  const Facets = ComputeFacets(Points, AffineBasisResult)
  return Facets.every(Facet => Dot(Facet.Normal, ComparePointRgb) <= Facet.Offset + Epsilon)
}

/** 1 at the convex hull's geometric centroid, 0 on its boundary, -1 outside; scales linearly in between along the ray from the centroid. */
export function RegionCentroidRatio(ComparePoint: string, RegionPoints: string[]): number {
  if (RegionPoints.length === 0) throw new RangeError('RegionPoints must contain at least one color')

  const Points = RegionPoints.map(ParseCssColor)
  const ComparePointRgb = ParseCssColor(ComparePoint)
  const AffineBasisResult = DetectAffineBasis(Points)

  if (ResidualDistance(ComparePointRgb, AffineBasisResult) > Epsilon) return -1

  const RegionCentroid = GeometricCentroid(Points, AffineBasisResult)
  const Direction = Subtract(ComparePointRgb, RegionCentroid)
  if (Length(Direction) < Epsilon) return 1

  const Facets = ComputeFacets(Points, AffineBasisResult)
  if (Facets.length === 0) return -1

  let ExitParameter = Infinity
  for (const Facet of Facets) {
    const NormalDotDirection = Dot(Facet.Normal, Direction)
    if (NormalDotDirection <= Epsilon) continue
    const Parameter = (Facet.Offset - Dot(Facet.Normal, RegionCentroid)) / NormalDotDirection
    if (Parameter < ExitParameter) ExitParameter = Parameter
  }

  if (!isFinite(ExitParameter) || ExitParameter < 1 - Epsilon) return -1
  if (ExitParameter <= 1 + Epsilon) return 0
  return 1 - 1 / ExitParameter
}
