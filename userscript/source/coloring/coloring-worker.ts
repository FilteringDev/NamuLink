import { IsInsideRegion, RegionCentroidRatio } from './coloring.js'
import { GetWorkerPort } from './worker-runtime.js'
import type { ColoringBatchItem, ColoringBatchRequest, ColoringBatchResponse, ColoringBatchResultValue } from './coloring-types.js'

function RunItem(Item: ColoringBatchItem): ColoringBatchResultValue {
  return Item.Op === 'IsInsideRegion'
    ? IsInsideRegion(Item.ComparePointHex, Item.RegionPoints)
    : RegionCentroidRatio(Item.ComparePointHex, Item.RegionPoints)
}

void (async () => {
  const Port = await GetWorkerPort()

  Port.OnMessage((Data) => {
    const Message = Data as ColoringBatchRequest
    if (!Message || Message.Kind !== 'batch') return

    try {
      const Results = Message.Items.map(RunItem)
      const Response: ColoringBatchResponse = { Kind: 'batch-result', RequestId: Message.RequestId, Results }
      Port.PostMessage(Response)
    } catch (ErrorValue) {
      const Response: ColoringBatchResponse = {
        Kind: 'batch-error',
        RequestId: Message.RequestId,
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
      }
      Port.PostMessage(Response)
    }
  })
})()

export {}
