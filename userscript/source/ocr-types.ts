export type TargetLabel = '파워링크' | '광고' | '광고등록'

export type BoundingBox = {
	X: number
	Y: number
	Width: number
	Height: number
}

export type MatchResult =
	| {
		Label: TargetLabel
		Score: number
		Box: BoundingBox
	}
	| null

export type WorkerDetectRequest = {
	Kind: 'detect'
	RequestId: string
	ImageData: ImageData
	BackgroundCandidates: string[]
	FontCandidates?: readonly string[]
	ScoreThreshold?: number
}

export type WorkerDetectSuccessResponse = {
	Kind: 'detect-result'
	RequestId: string
	Result: MatchResult
}

export type WorkerDetectErrorResponse = {
	Kind: 'detect-error'
	RequestId: string
	Error: string
}

export type WorkerMessage = WorkerDetectRequest
export type WorkerResponse = WorkerDetectSuccessResponse | WorkerDetectErrorResponse
