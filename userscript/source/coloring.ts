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

/** Euclidean RGB-cube distance between two HEX colors (0 = identical, ~441.67 = black/white). */
export function HexDistance(HexA: string, HexB: string): number {
  return Length(Subtract(ParseHexColor(HexA), ParseHexColor(HexB)))
}

function LinearizeSrgbChannel(Channel: number): number {
  const Normalized = Channel / 255
  return Normalized <= 0.04045 ? Normalized / 12.92 : ((Normalized + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance for a HEX color (0 = black, 1 = white). */
export function HexRelativeLuminance(Hex: string): number {
  const [Red, Green, Blue] = ParseHexColor(Hex)
  return 0.2126 * LinearizeSrgbChannel(Red)
    + 0.7152 * LinearizeSrgbChannel(Green)
    + 0.0722 * LinearizeSrgbChannel(Blue)
}

/** WCAG contrast ratio between text and background colors (1 = identical, 21 = black/white). */
export function HexContrastRatio(TextHex: string, BackgroundHex: string): number {
  const TextLuminance = HexRelativeLuminance(TextHex)
  const BackgroundLuminance = HexRelativeLuminance(BackgroundHex)
  const Lighter = Math.max(TextLuminance, BackgroundLuminance)
  const Darker = Math.min(TextLuminance, BackgroundLuminance)
  return (Lighter + 0.05) / (Darker + 0.05)
}

/** Whether a text/background color pair satisfies WCAG contrast guidance. */
export function IsReadableTextColor(TextHex: string, BackgroundHex: string, Options: TextReadabilityOptions = {}): boolean {
  const RequiredRatio = Options.Enhanced
    ? Options.LargeText ? 4.5 : 7
    : Options.LargeText ? 3 : 4.5
  return HexContrastRatio(TextHex, BackgroundHex) >= RequiredRatio
}

/** Normalized text readability score based on WCAG contrast ratio (0 = identical, 1 = black/white). */
export function TextReadabilityScore(TextHex: string, BackgroundHex: string): number {
  return (HexContrastRatio(TextHex, BackgroundHex) - 1) / 20
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

function ComputeFaces3D(Points: RGB[]): Face[] {
  const UniquePoints = Points.filter((Point, Index) => !Points.slice(0, Index).some(Previous => Previous[0] === Point[0] && Previous[1] === Point[1] && Previous[2] === Point[2]))
  const InteriorPoint = PointAverage(UniquePoints)
  const Faces: Face[] = []

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
        if (Faces.some(FaceValue => FaceValue.Vertices.length === Vertices.length && FaceValue.Vertices.every(Point => Vertices.includes(Point)))) continue

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

/** Whether ComparePointHex lies within (or on the boundary of) the convex hull of RegionPoints. */
export function IsInsideRegion(ComparePointHex: string, RegionPoints: string[]): boolean {
  if (RegionPoints.length === 0) throw new RangeError('RegionPoints must contain at least one color')

  const Points = RegionPoints.map(ParseHexColor)
  const ComparePoint = ParseHexColor(ComparePointHex)
  const AffineBasisResult = DetectAffineBasis(Points)

  if (ResidualDistance(ComparePoint, AffineBasisResult) > Epsilon) return false

  const Facets = ComputeFacets(Points, AffineBasisResult)
  return Facets.every(Facet => Dot(Facet.Normal, ComparePoint) <= Facet.Offset + Epsilon)
}

/** 1 at the convex hull's geometric centroid, 0 on its boundary, -1 outside; scales linearly in between along the ray from the centroid. */
export function RegionCentroidRatio(ComparePointHex: string, RegionPoints: string[]): number {
  if (RegionPoints.length === 0) throw new RangeError('RegionPoints must contain at least one color')

  const Points = RegionPoints.map(ParseHexColor)
  const ComparePoint = ParseHexColor(ComparePointHex)
  const AffineBasisResult = DetectAffineBasis(Points)

  if (ResidualDistance(ComparePoint, AffineBasisResult) > Epsilon) return -1

  const RegionCentroid = GeometricCentroid(Points, AffineBasisResult)
  const Direction = Subtract(ComparePoint, RegionCentroid)
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
