import type {
	BoundingBox,
	MatchResult,
	TargetLabel,
	WorkerDetectRequest,
	WorkerDetectSuccessResponse,
	WorkerDetectErrorResponse,
} from './ocr-types.js'

type GrayImage = {
	Width: number
	Height: number
	Data: Uint8ClampedArray
}

type BinaryImage = {
	Width: number
	Height: number
	Data: Uint8Array
}

const Targets: readonly TargetLabel[] = ['파워링크', '광고', '광고등록'] as const
const DefaultFontCandidates = [
	'Pretendard JP, sans-serif',
	'Pretendard, sans-serif',
	'system-ui, sans-serif',
	'Apple SD Gothic Neo, sans-serif',
	'Nanum Gothic, sans-serif',
	'Noto Sans KR, sans-serif',
	'Arial, sans-serif',
] as const

const TemplateCache = new Map<string, BinaryImage>()

function CreateCanvas(Width: number, Height: number): OffscreenCanvas {
	return new OffscreenCanvas(Math.max(1, Math.floor(Width)), Math.max(1, Math.floor(Height)))
}

function Get2DContext(Canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
	const Context2D = Canvas.getContext('2d', { willReadFrequently: true })
	if (!Context2D) throw new Error('2D context unavailable')
	return Context2D
}

const BlobCache = new Map<string, Blob>()

async function LoadBitmapFromUrl(Url: string): Promise<ImageBitmap> {
  let BlobData = BlobCache.get(Url)

  if (!BlobData) {
    const Response = await fetch(Url, { mode: 'cors', credentials: 'omit' })
    if (!Response.ok) {
      throw new Error(`Failed to fetch image: ${Response.status} ${Response.statusText}`)
    }

    BlobData = await Response.blob()
    BlobCache.set(Url, BlobData)
  }

  return await createImageBitmap(BlobData)
}

function DrawImageWithBackground(
	Source: CanvasImageSource,
	Width: number,
	Height: number,
	BackgroundCssColor: string,
): OffscreenCanvas {
	const Canvas = CreateCanvas(Width, Height)
	const Context2D = Get2DContext(Canvas)
	Context2D.fillStyle = BackgroundCssColor
	Context2D.fillRect(0, 0, Width, Height)
	Context2D.drawImage(Source, 0, 0, Width, Height)
	return Canvas
}

function CanvasToGrayImage(Canvas: OffscreenCanvas): GrayImage {
	const Context2D = Get2DContext(Canvas)
	const { width: Width, height: Height } = Canvas
	const Rgba = Context2D.getImageData(0, 0, Width, Height).data
	const Gray = new Uint8ClampedArray(Width * Height)

	for (let Index = 0, Pixel = 0; Index < Rgba.length; Index += 4, Pixel++) {
		const Red = Rgba[Index]
		const Green = Rgba[Index + 1]
		const Blue = Rgba[Index + 2]
		Gray[Pixel] = Math.round(0.299 * Red + 0.587 * Green + 0.114 * Blue)
	}

	return { Width, Height, Data: Gray }
}

function OtsuThreshold(Gray: GrayImage): number {
	const Histogram = new Uint32Array(256)
	for (let Index = 0; Index < Gray.Data.length; Index++) Histogram[Gray.Data[Index]]++

	const Total = Gray.Data.length
	let Sum = 0
	for (let Index = 0; Index < 256; Index++) Sum += Index * Histogram[Index]

	let SumBackground = 0
	let WeightBackground = 0
	let MaxVariance = -1
	let Threshold = 127

	for (let ThresholdIndex = 0; ThresholdIndex < 256; ThresholdIndex++) {
		WeightBackground += Histogram[ThresholdIndex]
		if (WeightBackground === 0) continue

		const WeightForeground = Total - WeightBackground
		if (WeightForeground === 0) break

		SumBackground += ThresholdIndex * Histogram[ThresholdIndex]
		const MeanBackground = SumBackground / WeightBackground
		const MeanForeground = (Sum - SumBackground) / WeightForeground
		const BetweenClassVariance =
			WeightBackground * WeightForeground * (MeanBackground - MeanForeground) * (MeanBackground - MeanForeground)

		if (BetweenClassVariance > MaxVariance) {
			MaxVariance = BetweenClassVariance
			Threshold = ThresholdIndex
		}
	}

	return Threshold
}

function BinarizeByContrast(Gray: GrayImage): BinaryImage {
	const Threshold = OtsuThreshold(Gray)
	let DarkCount = 0
	let LightCount = 0

	for (let Index = 0; Index < Gray.Data.length; Index++) {
		if (Gray.Data[Index] < Threshold) DarkCount++
		else LightCount++
	}

	const TextIsDark = DarkCount < LightCount
	const Output = new Uint8Array(Gray.Width * Gray.Height)

	for (let Index = 0; Index < Gray.Data.length; Index++) {
		const IsText = TextIsDark ? Gray.Data[Index] < Threshold : Gray.Data[Index] > Threshold
		Output[Index] = IsText ? 1 : 0
	}

	return { Width: Gray.Width, Height: Gray.Height, Data: Output }
}

function Erode3x3(Source: BinaryImage): BinaryImage {
	const Output = new Uint8Array(Source.Width * Source.Height)

	for (let Y = 1; Y < Source.Height - 1; Y++) {
		for (let X = 1; X < Source.Width - 1; X++) {
			let Keep = 1
			for (let DeltaY = -1; DeltaY <= 1 && Keep; DeltaY++) {
				for (let DeltaX = -1; DeltaX <= 1; DeltaX++) {
					if (Source.Data[(Y + DeltaY) * Source.Width + (X + DeltaX)] === 0) {
						Keep = 0
						break
					}
				}
			}
			Output[Y * Source.Width + X] = Keep
		}
	}

	return { Width: Source.Width, Height: Source.Height, Data: Output }
}

function Dilate3x3(Source: BinaryImage): BinaryImage {
	const Output = new Uint8Array(Source.Width * Source.Height)

	for (let Y = 1; Y < Source.Height - 1; Y++) {
		for (let X = 1; X < Source.Width - 1; X++) {
			let Value = 0
			for (let DeltaY = -1; DeltaY <= 1 && !Value; DeltaY++) {
				for (let DeltaX = -1; DeltaX <= 1; DeltaX++) {
					if (Source.Data[(Y + DeltaY) * Source.Width + (X + DeltaX)] === 1) {
						Value = 1
						break
					}
				}
			}
			Output[Y * Source.Width + X] = Value
		}
	}

	return { Width: Source.Width, Height: Source.Height, Data: Output }
}

function OpenClose(Source: BinaryImage): BinaryImage {
	return Dilate3x3(Erode3x3(Dilate3x3(Source)))
}

function FindConnectedComponents(Source: BinaryImage, MinArea = 20): BoundingBox[] {
	const Visited = new Uint8Array(Source.Width * Source.Height)
	const Boxes: BoundingBox[] = []
	const QueueX = new Int32Array(Source.Width * Source.Height)
	const QueueY = new Int32Array(Source.Width * Source.Height)

	for (let Y = 0; Y < Source.Height; Y++) {
		for (let X = 0; X < Source.Width; X++) {
			const Index = Y * Source.Width + X
			if (Visited[Index] || Source.Data[Index] === 0) continue

			let Head = 0
			let Tail = 0
			QueueX[Tail] = X
			QueueY[Tail] = Y
			Tail++
			Visited[Index] = 1

			let MinX = X
			let MinY = Y
			let MaxX = X
			let MaxY = Y
			let Area = 0

			while (Head < Tail) {
				const CurrentX = QueueX[Head]
				const CurrentY = QueueY[Head]
				Head++
				Area++
				if (CurrentX < MinX) MinX = CurrentX
				if (CurrentY < MinY) MinY = CurrentY
				if (CurrentX > MaxX) MaxX = CurrentX
				if (CurrentY > MaxY) MaxY = CurrentY

				for (let DeltaY = -1; DeltaY <= 1; DeltaY++) {
					for (let DeltaX = -1; DeltaX <= 1; DeltaX++) {
						if (DeltaX === 0 && DeltaY === 0) continue
						const NextX = CurrentX + DeltaX
						const NextY = CurrentY + DeltaY
						if (NextX < 0 || NextY < 0 || NextX >= Source.Width || NextY >= Source.Height) continue

						const NextIndex = NextY * Source.Width + NextX
						if (Visited[NextIndex] || Source.Data[NextIndex] === 0) continue
						Visited[NextIndex] = 1
						QueueX[Tail] = NextX
						QueueY[Tail] = NextY
						Tail++
					}
				}
			}

			if (Area >= MinArea) {
				Boxes.push({ X: MinX, Y: MinY, Width: MaxX - MinX + 1, Height: MaxY - MinY + 1 })
			}
		}
	}

	return Boxes
}

function MergeNearbyBoxes(Boxes: BoundingBox[], GapX = 8, GapY = 4): BoundingBox[] {
	const Result = [...Boxes]
	let Changed = true

	function OverlapsOrNear(A: BoundingBox, B: BoundingBox): boolean {
		const AX2 = A.X + A.Width
		const AY2 = A.Y + A.Height
		const BX2 = B.X + B.Width
		const BY2 = B.Y + B.Height
		return !(
			AX2 + GapX < B.X
			|| BX2 + GapX < A.X
			|| AY2 + GapY < B.Y
			|| BY2 + GapY < A.Y
		)
	}

	while (Changed) {
		Changed = false
		outer: for (let IndexA = 0; IndexA < Result.length; IndexA++) {
			for (let IndexB = IndexA + 1; IndexB < Result.length; IndexB++) {
				if (!OverlapsOrNear(Result[IndexA], Result[IndexB])) continue
				const A = Result[IndexA]
				const B = Result[IndexB]
				Result[IndexA] = {
					X: Math.min(A.X, B.X),
					Y: Math.min(A.Y, B.Y),
					Width: Math.max(A.X + A.Width, B.X + B.Width) - Math.min(A.X, B.X),
					Height: Math.max(A.Y + A.Height, B.Y + B.Height) - Math.min(A.Y, B.Y),
				}
				Result.splice(IndexB, 1)
				Changed = true
				break outer
			}
		}
	}

	return Result
}

function CropBinary(Source: BinaryImage, Box: BoundingBox): BinaryImage {
	const Output = new Uint8Array(Box.Width * Box.Height)
	for (let Y = 0; Y < Box.Height; Y++) {
		for (let X = 0; X < Box.Width; X++) {
			Output[Y * Box.Width + X] = Source.Data[(Box.Y + Y) * Source.Width + (Box.X + X)]
		}
	}
	return { Width: Box.Width, Height: Box.Height, Data: Output }
}

function TrimBinary(Source: BinaryImage): BinaryImage {
	let MinX = Source.Width
	let MinY = Source.Height
	let MaxX = -1
	let MaxY = -1

	for (let Y = 0; Y < Source.Height; Y++) {
		for (let X = 0; X < Source.Width; X++) {
			if (Source.Data[Y * Source.Width + X] === 0) continue
			if (X < MinX) MinX = X
			if (Y < MinY) MinY = Y
			if (X > MaxX) MaxX = X
			if (Y > MaxY) MaxY = Y
		}
	}

	if (MaxX < MinX || MaxY < MinY) {
		return { Width: 1, Height: 1, Data: new Uint8Array([0]) }
	}

	return CropBinary(Source, { X: MinX, Y: MinY, Width: MaxX - MinX + 1, Height: MaxY - MinY + 1 })
}

function ResizeBinaryNearest(Source: BinaryImage, Width: number, Height: number): BinaryImage {
	const Output = new Uint8Array(Width * Height)

	for (let Y = 0; Y < Height; Y++) {
		for (let X = 0; X < Width; X++) {
			const SourceX = Math.min(Source.Width - 1, Math.floor((X / Width) * Source.Width))
			const SourceY = Math.min(Source.Height - 1, Math.floor((Y / Height) * Source.Height))
			Output[Y * Width + X] = Source.Data[SourceY * Source.Width + SourceX]
		}
	}

	return { Width, Height, Data: Output }
}

function NormalizeBinary(Source: BinaryImage, Size = 64): BinaryImage {
	const Trimmed = TrimBinary(Source)
	const Side = Math.max(Trimmed.Width, Trimmed.Height)
	const Padded = new Uint8Array(Side * Side)
	const OffsetX = Math.floor((Side - Trimmed.Width) / 2)
	const OffsetY = Math.floor((Side - Trimmed.Height) / 2)

	for (let Y = 0; Y < Trimmed.Height; Y++) {
		for (let X = 0; X < Trimmed.Width; X++) {
			Padded[(Y + OffsetY) * Side + (X + OffsetX)] = Trimmed.Data[Y * Trimmed.Width + X]
		}
	}

	return ResizeBinaryNearest({ Width: Side, Height: Side, Data: Padded }, Size, Size)
}

function XorDistance(Left: BinaryImage, Right: BinaryImage): number {
	if (Left.Width !== Right.Width || Left.Height !== Right.Height) {
		throw new Error('Image size mismatch')
	}
	let Different = 0
	for (let Index = 0; Index < Left.Data.length; Index++) {
		if (Left.Data[Index] !== Right.Data[Index]) Different++
	}
	return Different / Left.Data.length
}

function GetTemplate(Text: string, FontFamily: string): BinaryImage {
	const CacheKey = `${Text}__${FontFamily}`
	const Cached = TemplateCache.get(CacheKey)
	if (Cached) return Cached

	const Width = 256
	const Height = 96
	const Canvas = CreateCanvas(Width, Height)
	const Context2D = Get2DContext(Canvas)
	Context2D.fillStyle = 'white'
	Context2D.fillRect(0, 0, Width, Height)
	let FontSize = Math.floor(Height * 0.72)

	while (FontSize > 8) {
		Context2D.clearRect(0, 0, Width, Height)
		Context2D.fillStyle = 'white'
		Context2D.fillRect(0, 0, Width, Height)
		Context2D.fillStyle = 'black'
		Context2D.textAlign = 'center'
		Context2D.textBaseline = 'middle'
		Context2D.font = `700 ${FontSize}px ${FontFamily}`

		const Metrics = Context2D.measureText(Text)
		const TextWidth = Metrics.width
		const TextHeight =
			(Metrics.actualBoundingBoxAscent || FontSize * 0.8)
			+ (Metrics.actualBoundingBoxDescent || FontSize * 0.2)

		if (TextWidth <= Width * 0.9 && TextHeight <= Height * 0.9) {
			Context2D.fillText(Text, Width / 2, Height / 2)
			const Gray = CanvasToGrayImage(Canvas)
			const Template = NormalizeBinary(BinarizeByContrast(Gray))
			TemplateCache.set(CacheKey, Template)
			return Template
		}
		FontSize--
	}

	Context2D.font = `700 12px ${FontFamily}`
	Context2D.fillStyle = 'black'
	Context2D.textAlign = 'center'
	Context2D.textBaseline = 'middle'
	Context2D.fillText(Text, Width / 2, Height / 2)
	const Template = NormalizeBinary(BinarizeByContrast(CanvasToGrayImage(Canvas)))
	TemplateCache.set(CacheKey, Template)
	return Template
}

function ScoreRegionAgainstTarget(Region: BinaryImage, Target: TargetLabel, FontCandidates: readonly string[]): number {
	const NormalizedRegion = NormalizeBinary(Region)
	let Best = Number.POSITIVE_INFINITY
	for (const FontFamily of FontCandidates) {
		const Template = GetTemplate(Target, FontFamily)
		const Score = XorDistance(NormalizedRegion, Template)
		if (Score < Best) Best = Score
	}
	return Best
}

function SelectTextRegions(Binary: BinaryImage): BoundingBox[] {
	const Raw = FindConnectedComponents(Binary, 16)
	const Merged = MergeNearbyBoxes(Raw, 10, 6)
	return Merged.filter((Box) => {
		if (Box.Width < 8 || Box.Height < 8) return false
		const Ratio = Box.Width / Box.Height
		return Ratio > 0.5 && Ratio < 12
	})
}

async function DetectFromSource(Request: WorkerDetectRequest): Promise<MatchResult> {
	const HasTransparency = HasTransparentPixelsInImageData(Request.ImageData)
	const BackgroundCandidates = HasTransparency
		? Request.BackgroundCandidates
		: Request.BackgroundCandidates.slice(0, 1)

	const FontCandidates = Request.FontCandidates ?? DefaultFontCandidates
	const ScoreThreshold = Request.ScoreThreshold ?? 0.32
	let Best: MatchResult = null

	for (const BackgroundColor of BackgroundCandidates) {
		const CompositedImageData = CompositeImageDataOnBackground(Request.ImageData, BackgroundColor)
		const Gray = ImageDataToGrayImage(CompositedImageData)
		const Binary = OpenClose(BinarizeByContrast(Gray))
		const Regions = SelectTextRegions(Binary)
		if (Regions.length === 0) continue

		for (const Box of Regions) {
			const Region = CropBinary(Binary, Box)
			for (const Target of Targets) {
				const Score = ScoreRegionAgainstTarget(Region, Target, FontCandidates)
				if (!Best || Score < Best.Score) {
					Best = { Label: Target, Score, Box }
				}
			}
		}
	}

	if (!Best) return null
	if (Best.Score > ScoreThreshold) return null
	return Best
}

function ImageDataToGrayImage(Source: ImageData): GrayImage {
	const { width: Width, height: Height, data: Rgba } = Source
	const Gray = new Uint8ClampedArray(Width * Height)

	for (let Index = 0, Pixel = 0; Index < Rgba.length; Index += 4, Pixel++) {
		const Red = Rgba[Index]
		const Green = Rgba[Index + 1]
		const Blue = Rgba[Index + 2]
		Gray[Pixel] = Math.round(0.299 * Red + 0.587 * Green + 0.114 * Blue)
	}

	return { Width, Height, Data: Gray }
}

function HasTransparentPixelsInImageData(Source: ImageData): boolean {
	const Rgba = Source.data

	for (let Index = 3; Index < Rgba.length; Index += 4) {
		if (Rgba[Index] < 255) return true
	}

	return false
}

function CompositeImageDataOnBackground(Source: ImageData, BackgroundCssColor: string): ImageData {
	const Canvas = CreateCanvas(Source.width, Source.height)
	const Context2D = Get2DContext(Canvas)

	Context2D.fillStyle = BackgroundCssColor
	Context2D.fillRect(0, 0, Source.width, Source.height)
	Context2D.putImageData(Source, 0, 0)

	return Context2D.getImageData(0, 0, Source.width, Source.height)
}

self.addEventListener('message', (Event: MessageEvent<WorkerDetectRequest>) => {
	void (async () => {
		const Message = Event.data
		if (!Message || Message.Kind !== 'detect') return

		try {
			const Result = await DetectFromSource(Message)
			const Response: WorkerDetectSuccessResponse = {
				Kind: 'detect-result',
				RequestId: Message.RequestId,
				Result,
			}
			self.postMessage(Response)
		} catch (ErrorValue) {
			const ErrorMessage = ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
			const Response: WorkerDetectErrorResponse = {
				Kind: 'detect-error',
				RequestId: Message.RequestId,
				Error: ErrorMessage,
			}
			self.postMessage(Response)
		}
	})()
})

export {}
