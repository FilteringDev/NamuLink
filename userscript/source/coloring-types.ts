export type ColoringOperation = 'IsInsideRegion' | 'RegionCentroidRatio'

export type ColoringBatchItem = {
  Op: ColoringOperation
  ComparePointHex: string
  RegionPoints: string[]
}

export type ColoringBatchResultValue = boolean | number

export type ColoringBatchRequest = {
  Kind: 'batch'
  RequestId: string
  Items: ColoringBatchItem[]
}

export type ColoringBatchSuccessResponse = {
  Kind: 'batch-result'
  RequestId: string
  Results: ColoringBatchResultValue[]
}

export type ColoringBatchErrorResponse = {
  Kind: 'batch-error'
  RequestId: string
  Error: string
}

export type ColoringBatchResponse = ColoringBatchSuccessResponse | ColoringBatchErrorResponse
