import type { MatchResult, WorkerDetectRequest, WorkerResponse } from './ocr-types.js'

type DetectElementOptions = {
	FontCandidates?: readonly string[]
	ScoreThreshold?: number
}

type DetectSourceOptions = DetectElementOptions & {
	HostElement: HTMLElement
	SourceUrl: string
}

type SourceResponseData = {
	BlobData: Blob
	ContentTypeHeader: string | null
}

type OcrClientCache = {
	XhrResponses: Map<string, SourceResponseData>
	PendingXhrResponses: Map<string, Promise<SourceResponseData | null>>
	ImageDataValues: Map<string, ImageData>
	PendingImageDataValues: Map<string, Promise<ImageData | null>>
	OcrResults: Map<string, MatchResult>
	PendingOcrResults: Map<string, Promise<MatchResult>>
}

function ParseBackgroundImageUrl(BackgroundImage: string): string | null {
	const Trimmed = BackgroundImage.trim()
	if (!Trimmed || Trimmed === 'none') return null

	const Match = Trimmed.match(/^url\((.*)\)$/i)
	if (!Match) return null

	let Inner = Match[1].trim()
	if ((Inner.startsWith('"') && Inner.endsWith('"')) || (Inner.startsWith('\'') && Inner.endsWith('\''))) {
		Inner = Inner.slice(1, -1)
	}
	return Inner
}

function GetElementEffectiveBackgroundColor(BrowserWindow: typeof window, Element: HTMLElement): string {
	let Node: HTMLElement | null = Element

	while (Node) {
		const Background = BrowserWindow.getComputedStyle(Node).backgroundColor
		if (Background && Background !== 'transparent' && Background !== 'rgba(0, 0, 0, 0)') {
			return Background
		}
		Node = Node.parentElement
	}

	return 'rgb(255, 255, 255)'
}

function GetBackgroundColorCandidates(BrowserWindow: typeof window, Element: HTMLElement, FallbackBackground: string): string[] {
	const Candidates = new Set<string>()

	function AddCandidate(BackgroundColor: string | null | undefined): void {
		if (!BackgroundColor) return
		if (BackgroundColor === 'transparent' || BackgroundColor === 'rgba(0, 0, 0, 0)') return
		Candidates.add(BackgroundColor)
	}

	AddCandidate(FallbackBackground)

	const ElementStyle = BrowserWindow.getComputedStyle(Element)
	AddCandidate(ElementStyle.backgroundColor)
	AddCandidate(ElementStyle.color)
	AddCandidate(BrowserWindow.getComputedStyle(BrowserWindow.document.documentElement).backgroundColor)

	if (BrowserWindow.document.body) {
		const BodyStyle = BrowserWindow.getComputedStyle(BrowserWindow.document.body)
		AddCandidate(BodyStyle.backgroundColor)
		AddCandidate(BodyStyle.color)
	}

	AddCandidate('rgb(255, 255, 255)')
	AddCandidate('rgb(0, 0, 0)')

	return [...Candidates]
}

function ResolveElementSource(BrowserWindow: typeof window, Element: HTMLElement): string | null {
	if (Element instanceof BrowserWindow.HTMLImageElement) {
		const ImageSource = Element.currentSrc || Element.src || ''
		return ImageSource || null
	}

	const BackgroundImage = BrowserWindow.getComputedStyle(Element).backgroundImage
	return ParseBackgroundImageUrl(BackgroundImage)
}

function CreateOcrClientCache(): OcrClientCache {
	return {
		XhrResponses: new Map(),
		PendingXhrResponses: new Map(),
		ImageDataValues: new Map(),
		PendingImageDataValues: new Map(),
		OcrResults: new Map(),
		PendingOcrResults: new Map(),
	}
}

function ClearOcrClientCache(Cache: OcrClientCache): void {
	Cache.XhrResponses.clear()
	Cache.PendingXhrResponses.clear()
	Cache.ImageDataValues.clear()
	Cache.PendingImageDataValues.clear()
	Cache.OcrResults.clear()
	Cache.PendingOcrResults.clear()
}

function NormalizeSourceUrl(BrowserWindow: typeof window, SourceUrl: string): string {
	try {
		return new BrowserWindow.URL(SourceUrl, BrowserWindow.location.href).href
	} catch {
		return SourceUrl
	}
}

function CreateCacheKey(Parts: readonly unknown[]): string {
	return JSON.stringify(Parts)
}

function CreateBitmapImageDataCacheKey(SourceUrl: string): string {
	return CreateCacheKey(['bitmap-image-data', SourceUrl])
}

function CreateSvgImageDataCacheKey(
	BrowserWindow: typeof window,
	HostElement: HTMLElement,
	SourceUrl: string,
): string {
	const { Width, Height } = GetRasterSize(BrowserWindow, HostElement)
	return CreateCacheKey(['svg-image-data', SourceUrl, Width, Height])
}

function CreateOcrResultCacheKey(
	SourceUrl: string,
	ImageDataValue: ImageData,
	BackgroundCandidates: readonly string[],
	Options?: DetectElementOptions,
): string {
	return CreateCacheKey([
		'ocr-result',
		SourceUrl,
		ImageDataValue.width,
		ImageDataValue.height,
		BackgroundCandidates,
		Options?.FontCandidates ?? null,
		Options?.ScoreThreshold ?? 0.32,
	])
}

export function CreateOcrWorkerClient(BrowserWindow: typeof window, WorkerInstance: Worker) {
	let RequestSequence = 0
	const Pending = new Map<string, { Resolve: (Value: MatchResult) => void, Reject: (Reason?: unknown) => void }>()
	const Cache = CreateOcrClientCache()

	WorkerInstance.addEventListener('message', (Event: MessageEvent<WorkerResponse>) => {
		const Message = Event.data
		if (!Message || !('RequestId' in Message)) return

		const PendingRequest = Pending.get(Message.RequestId)
		if (!PendingRequest) return
		Pending.delete(Message.RequestId)

		if (Message.Kind === 'detect-result') {
			PendingRequest.Resolve(Message.Result)
			return
		}

		PendingRequest.Reject(new Error(Message.Error))
	})

	function PostDetect(Request: Omit<WorkerDetectRequest, 'Kind' | 'RequestId'>): Promise<MatchResult> {
		const RequestId = `ocr-${Date.now()}-${RequestSequence++}`
		const Message: WorkerDetectRequest = {
			Kind: 'detect',
			RequestId,
			...Request,
		}

		return new Promise<MatchResult>((Resolve, Reject) => {
			Pending.set(RequestId, { Resolve, Reject })
			WorkerInstance.postMessage(Message)
		})
	}

	function DetectFromImageDataWithCache(
		SourceUrl: string,
		ImageDataValue: ImageData,
		BackgroundCandidates: string[],
		Options?: DetectElementOptions,
	): Promise<MatchResult> {
		const CacheKey = CreateOcrResultCacheKey(SourceUrl, ImageDataValue, BackgroundCandidates, Options)
		if (Cache.OcrResults.has(CacheKey)) {
			return Promise.resolve(Cache.OcrResults.get(CacheKey) ?? null)
		}

		const ExistingPendingResult = Cache.PendingOcrResults.get(CacheKey)
		if (ExistingPendingResult) return ExistingPendingResult

		const PendingResult = PostDetect({
			ImageData: ImageDataValue,
			BackgroundCandidates,
			FontCandidates: Options?.FontCandidates,
			ScoreThreshold: Options?.ScoreThreshold,
		}).then((Result) => {
			Cache.OcrResults.set(CacheKey, Result)
			return Result
		}).finally(() => {
			Cache.PendingOcrResults.delete(CacheKey)
		})

		Cache.PendingOcrResults.set(CacheKey, PendingResult)
		return PendingResult
	}

	async function DetectFromElement(Element: HTMLElement, Options?: DetectElementOptions): Promise<MatchResult> {
		const SourceUrl = ResolveElementSource(BrowserWindow, Element)
		if (!SourceUrl) return null

		const NormalizedSourceUrl = NormalizeSourceUrl(BrowserWindow, SourceUrl)
		const ImageDataValue = await LoadImageDataFromSourceUrl(BrowserWindow, Element, NormalizedSourceUrl, Cache)
		if (!ImageDataValue) return null

		const FallbackBackground = GetElementEffectiveBackgroundColor(BrowserWindow, Element)
		const BackgroundCandidates = GetBackgroundColorCandidates(BrowserWindow, Element, FallbackBackground)

		return DetectFromImageDataWithCache(NormalizedSourceUrl, ImageDataValue, BackgroundCandidates, Options)
	}

	async function DetectFromSource(Options: DetectSourceOptions): Promise<MatchResult> {
		const NormalizedSourceUrl = NormalizeSourceUrl(BrowserWindow, Options.SourceUrl)
		const ImageDataValue = await LoadImageDataFromSourceUrl(
			BrowserWindow,
			Options.HostElement,
			NormalizedSourceUrl,
			Cache,
		)
		if (!ImageDataValue) return null

		const FallbackBackground = GetElementEffectiveBackgroundColor(BrowserWindow, Options.HostElement)
		const BackgroundCandidates = GetBackgroundColorCandidates(BrowserWindow, Options.HostElement, FallbackBackground)

		return DetectFromImageDataWithCache(NormalizedSourceUrl, ImageDataValue, BackgroundCandidates, Options)
	}

	return {
		DetectFromElement,
		DetectFromSource,
		Terminate(): void {
			for (const PendingRequest of Pending.values()) {
				PendingRequest.Reject(new Error('OCR worker terminated'))
			}
			Pending.clear()
			ClearOcrClientCache(Cache)
			WorkerInstance.terminate()
		},
	}
}

function IsSvgDataUrl(SourceUrl: string): boolean {
	return /^data:image\/svg\+xml(?:[;,]|$)/i.test(SourceUrl)
}

function DecodeBase64Utf8(BrowserWindow: typeof window, Base64Text: string): string {
	const Binary = BrowserWindow.atob(Base64Text)
	const Bytes = new Uint8Array(Binary.length)

	for (let Index = 0; Index < Binary.length; Index++) {
		Bytes[Index] = Binary.charCodeAt(Index)
	}

	return new TextDecoder().decode(Bytes)
}

function DecodeSvgDataUrl(BrowserWindow: typeof window, SourceUrl: string): string {
	const CommaIndex = SourceUrl.indexOf(',')
	if (CommaIndex < 0) throw new Error('Invalid SVG data URL')

	const Header = SourceUrl.slice(0, CommaIndex).toLowerCase()
	const Payload = SourceUrl.slice(CommaIndex + 1)

	if (Header.includes(';base64')) {
		return DecodeBase64Utf8(BrowserWindow, Payload)
	}

	return decodeURIComponent(Payload)
}

function PrepareSvgMarkupForRasterize(
	BrowserWindow: typeof window,
	SvgMarkup: string,
	Width: number,
	Height: number,
): string {
	const Parser = new BrowserWindow.DOMParser()
	const XmlDocument = Parser.parseFromString(SvgMarkup, 'image/svg+xml')

	if (XmlDocument.querySelector('parsererror')) {
		throw new Error('Failed to parse SVG markup')
	}

	const SvgElement = XmlDocument.documentElement
	if (!SvgElement || SvgElement.nodeName.toLowerCase() !== 'svg') {
		throw new Error('SVG root element not found')
	}

	if (!SvgElement.getAttribute('xmlns')) {
		SvgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
	}

	if (!SvgElement.getAttribute('width')) {
		SvgElement.setAttribute('width', String(Width))
	}

	if (!SvgElement.getAttribute('height')) {
		SvgElement.setAttribute('height', String(Height))
	}

	return new BrowserWindow.XMLSerializer().serializeToString(XmlDocument)
}

function WaitForImageLoad(ImageElement: HTMLImageElement): Promise<void> {
	if (ImageElement.complete && ImageElement.naturalWidth > 0) {
		return Promise.resolve()
	}

	return new Promise<void>((Resolve, Reject) => {
		function Cleanup(): void {
			ImageElement.removeEventListener('load', OnLoad)
			ImageElement.removeEventListener('error', OnError)
		}

		function OnLoad(): void {
			Cleanup()
			Resolve()
		}

		function OnError(): void {
			Cleanup()
			Reject(new Error('Failed to load SVG image'))
		}

		ImageElement.addEventListener('load', OnLoad)
		ImageElement.addEventListener('error', OnError)
	})
}

async function LoadImageElement(BrowserWindow: typeof window, SourceUrl: string): Promise<HTMLImageElement> {
	const ImageElement = new BrowserWindow.Image()
	ImageElement.decoding = 'async'
	ImageElement.src = SourceUrl

	try {
		await ImageElement.decode()
		if (ImageElement.naturalWidth > 0) {
			return ImageElement
		}
	} catch {
	}

	await WaitForImageLoad(ImageElement)
	return ImageElement
}

function IsSvgMimeType(MimeType: string | null): boolean {
	return typeof MimeType === 'string' && /^image\/svg\+xml(?:\s*;|$)/i.test(MimeType)
}

function GetRasterSize(BrowserWindow: typeof window, HostElement: HTMLElement): { Width: number, Height: number } {
	const Rect = HostElement.getBoundingClientRect()
	const Scale = Math.max(1, BrowserWindow.devicePixelRatio || 1)

	return {
		Width: Math.max(1, Math.round((Rect.width || HostElement.clientWidth || 96) * Scale)),
		Height: Math.max(1, Math.round((Rect.height || HostElement.clientHeight || 32) * Scale)),
	}
}

async function RasterizeSvgMarkupToImageData(
	BrowserWindow: typeof window,
	HostElement: HTMLElement,
	SvgMarkup: string,
): Promise<ImageData> {
	const { Width, Height } = GetRasterSize(BrowserWindow, HostElement)
	const PreparedSvgMarkup = PrepareSvgMarkupForRasterize(BrowserWindow, SvgMarkup, Width, Height)

	const SvgBlobUrl = BrowserWindow.URL.createObjectURL(
		new BrowserWindow.Blob([PreparedSvgMarkup], { type: 'image/svg+xml' })
	)

	try {
		const ImageElement = await LoadImageElement(BrowserWindow, SvgBlobUrl)

		const Canvas = BrowserWindow.document.createElement('canvas')
		Canvas.width = Width
		Canvas.height = Height

		const Context2D = Canvas.getContext('2d', { willReadFrequently: true })
		if (!Context2D) throw new Error('2D context unavailable')

		Context2D.clearRect(0, 0, Width, Height)
		Context2D.drawImage(ImageElement, 0, 0, Width, Height)

		return Context2D.getImageData(0, 0, Width, Height)
	} finally {
		BrowserWindow.URL.revokeObjectURL(SvgBlobUrl)
	}
}

async function RasterizeBitmapBlobToImageData(
	BrowserWindow: typeof window,
	BlobData: Blob,
): Promise<ImageData> {
	const Bitmap = await BrowserWindow.createImageBitmap(BlobData)

	try {
		const Canvas = BrowserWindow.document.createElement('canvas')
		Canvas.width = Bitmap.width
		Canvas.height = Bitmap.height

		const Context2D = Canvas.getContext('2d', { willReadFrequently: true })
		if (!Context2D) throw new Error('2D context unavailable')

		Context2D.drawImage(Bitmap, 0, 0)
		return Context2D.getImageData(0, 0, Canvas.width, Canvas.height)
	} finally {
		Bitmap.close()
	}
}

async function LoadImageDataFromSourceUrl(
	BrowserWindow: typeof window,
	HostElement: HTMLElement,
	SourceUrl: string,
	Cache: OcrClientCache,
): Promise<ImageData | null> {
	if (IsSvgDataUrl(SourceUrl)) {
		const ImageDataCacheKey = CreateSvgImageDataCacheKey(BrowserWindow, HostElement, SourceUrl)
		return await LoadCachedImageData(Cache, ImageDataCacheKey, async () => {
			const SvgMarkup = DecodeSvgDataUrl(BrowserWindow, SourceUrl)
			return await RasterizeSvgMarkupToImageData(BrowserWindow, HostElement, SvgMarkup)
		})
	}

	const BitmapImageDataCacheKey = CreateBitmapImageDataCacheKey(SourceUrl)
	const CachedBitmapImageData = GetCachedImageData(Cache, BitmapImageDataCacheKey)
	if (CachedBitmapImageData) return CachedBitmapImageData

	const SvgImageDataCacheKey = CreateSvgImageDataCacheKey(BrowserWindow, HostElement, SourceUrl)
	const CachedSvgImageData = GetCachedImageData(Cache, SvgImageDataCacheKey)
	if (CachedSvgImageData) return CachedSvgImageData

	const ResponseData = await LoadCachedSourceResponseData(Cache, SourceUrl)
	if (!ResponseData) return null

	if (IsSvgMimeType(ResponseData.BlobData.type) || IsSvgMimeType(ResponseData.ContentTypeHeader)) {
		return await LoadCachedImageData(Cache, SvgImageDataCacheKey, async () => {
			const SvgMarkup = await ResponseData.BlobData.text()
			return await RasterizeSvgMarkupToImageData(BrowserWindow, HostElement, SvgMarkup)
		})
	}

	return await LoadCachedImageData(Cache, BitmapImageDataCacheKey, async () => {
		return await RasterizeBitmapBlobToImageData(BrowserWindow, ResponseData.BlobData)
	})
}

function GetCachedImageData(Cache: OcrClientCache, CacheKey: string): ImageData | null {
	if (!Cache.ImageDataValues.has(CacheKey)) return null
	return Cache.ImageDataValues.get(CacheKey) ?? null
}

function LoadCachedImageData(
	Cache: OcrClientCache,
	CacheKey: string,
	Loader: () => Promise<ImageData>,
): Promise<ImageData | null> {
	const CachedImageData = GetCachedImageData(Cache, CacheKey)
	if (CachedImageData) return Promise.resolve(CachedImageData)

	const ExistingPendingImageData = Cache.PendingImageDataValues.get(CacheKey)
	if (ExistingPendingImageData) return ExistingPendingImageData

	const PendingImageData = Loader().then((ImageDataValue) => {
		Cache.ImageDataValues.set(CacheKey, ImageDataValue)
		return ImageDataValue
	}).finally(() => {
		Cache.PendingImageDataValues.delete(CacheKey)
	})

	Cache.PendingImageDataValues.set(CacheKey, PendingImageData)
	return PendingImageData
}

function LoadCachedSourceResponseData(Cache: OcrClientCache, SourceUrl: string): Promise<SourceResponseData | null> {
	if (Cache.XhrResponses.has(SourceUrl)) {
		return Promise.resolve(Cache.XhrResponses.get(SourceUrl) ?? null)
	}

	const ExistingPendingResponseData = Cache.PendingXhrResponses.get(SourceUrl)
	if (ExistingPendingResponseData) return ExistingPendingResponseData

	const PendingResponseData = LoadSourceResponseData(SourceUrl).then((ResponseData) => {
		if (ResponseData) Cache.XhrResponses.set(SourceUrl, ResponseData)
		return ResponseData
	}).finally(() => {
		Cache.PendingXhrResponses.delete(SourceUrl)
	})

	Cache.PendingXhrResponses.set(SourceUrl, PendingResponseData)
	return PendingResponseData
}

function LoadSourceResponseData(SourceUrl: string): Promise<SourceResponseData | null> {
	return new Promise<SourceResponseData | null>((Resolve) => {
		GM.xmlHttpRequest({
			url: SourceUrl,
			method: 'GET',
			responseType: 'blob',
			onload: (ResponseValue) => {
				if (ResponseValue.status < 200 || ResponseValue.status >= 300) {
					Resolve(null)
					return
				}

				const BlobData = ResponseValue.response
				if (!(BlobData instanceof Blob)) {
					Resolve(null)
					return
				}

				const ResponseHeaders = typeof ResponseValue.responseHeaders === 'string'
					? ResponseValue.responseHeaders
					: ''
				const HeaderMatch = ResponseHeaders.match(/^content-type:\s*(.+)$/im)
				const ContentTypeHeader = HeaderMatch ? HeaderMatch[1].trim() : null

				Resolve({ BlobData, ContentTypeHeader })
			},
			onerror: () => Resolve(null),
			ontimeout: () => Resolve(null),
		})
	})
}
