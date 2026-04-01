import type { MatchResult, WorkerDetectRequest, WorkerResponse } from './ocr-types.js'

type DetectElementOptions = {
	FontCandidates?: readonly string[]
	ScoreThreshold?: number
}

type DetectSourceOptions = DetectElementOptions & {
	HostElement: HTMLElement
	SourceUrl: string
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

export function CreateOcrWorkerClient(BrowserWindow: typeof window, WorkerInstance: Worker) {
	let RequestSequence = 0
	const Pending = new Map<string, { Resolve: (Value: MatchResult) => void, Reject: (Reason?: unknown) => void }>()

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

	async function DetectFromElement(Element: HTMLElement, Options?: DetectElementOptions): Promise<MatchResult> {
		const SourceUrl = ResolveElementSource(BrowserWindow, Element)
		if (!SourceUrl) return null

		const ImageDataValue = await LoadImageDataFromSourceUrl(BrowserWindow, Element, SourceUrl)
		const FallbackBackground = GetElementEffectiveBackgroundColor(BrowserWindow, Element)
		const BackgroundCandidates = GetBackgroundColorCandidates(BrowserWindow, Element, FallbackBackground)

		return PostDetect({
			ImageData: ImageDataValue,
			BackgroundCandidates,
			FontCandidates: Options?.FontCandidates,
			ScoreThreshold: Options?.ScoreThreshold,
		})
	}

	async function DetectFromSource(Options: DetectSourceOptions): Promise<MatchResult> {
		const ImageDataValue = await LoadImageDataFromSourceUrl(
			BrowserWindow,
			Options.HostElement,
			Options.SourceUrl,
		)

		const FallbackBackground = GetElementEffectiveBackgroundColor(BrowserWindow, Options.HostElement)
		const BackgroundCandidates = GetBackgroundColorCandidates(BrowserWindow, Options.HostElement, FallbackBackground)

		return PostDetect({
			ImageData: ImageDataValue,
			BackgroundCandidates,
			FontCandidates: Options.FontCandidates,
			ScoreThreshold: Options.ScoreThreshold,
		})
	}

	return {
		DetectFromElement,
		DetectFromSource,
		Terminate(): void {
			for (const PendingRequest of Pending.values()) {
				PendingRequest.Reject(new Error('OCR worker terminated'))
			}
			Pending.clear()
			WorkerInstance.terminate()
		},
	}
}

const RasterizedSvgCache = new Map<string, Promise<string>>()

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

function GetSvgRasterSize(BrowserWindow: typeof window, HostElement: HTMLElement): { Width: number, Height: number } {
	const Rect = HostElement.getBoundingClientRect()
	const RasterScale = Math.max(2, BrowserWindow.devicePixelRatio || 1)

	const Width = Math.max(1, Math.round((Rect.width || HostElement.clientWidth || 96) * RasterScale))
	const Height = Math.max(1, Math.round((Rect.height || HostElement.clientHeight || 32) * RasterScale))

	return { Width, Height }
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
): Promise<ImageData> {
	if (IsSvgDataUrl(SourceUrl)) {
		const SvgMarkup = DecodeSvgDataUrl(BrowserWindow, SourceUrl)
		return await RasterizeSvgMarkupToImageData(BrowserWindow, HostElement, SvgMarkup)
	}

	const ResponseData = await new Promise<{ BlobData: Blob, ContentTypeHeader: string | null }>((Resolve, Reject) => {
		GM.xmlHttpRequest({
			url: SourceUrl,
			method: 'GET',
			responseType: 'blob',
			onload: (ResponseValue) => {
				if (ResponseValue.status < 200 || ResponseValue.status >= 300) {
					Reject(new Error(`Failed to fetch image: ${ResponseValue.status} ${ResponseValue.statusText}`))
					return
				}

				const BlobData = ResponseValue.response
				if (!(BlobData instanceof Blob)) {
					Reject(new Error('Failed to fetch image: invalid blob response'))
					return
				}

				const HeaderMatch = ResponseValue.responseHeaders.match(/^content-type:\s*(.+)$/im)
				const ContentTypeHeader = HeaderMatch ? HeaderMatch[1].trim() : null

				Resolve({ BlobData, ContentTypeHeader })
			},
			onerror: Reject,
			ontimeout: Reject,
		})
	})

	if (IsSvgMimeType(ResponseData.BlobData.type) || IsSvgMimeType(ResponseData.ContentTypeHeader)) {
		const SvgMarkup = await ResponseData.BlobData.text()
		return await RasterizeSvgMarkupToImageData(BrowserWindow, HostElement, SvgMarkup)
	}

	return await RasterizeBitmapBlobToImageData(BrowserWindow, ResponseData.BlobData)
}