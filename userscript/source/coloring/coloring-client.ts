import { CreateIsomorphicWorker, type WorkerLike } from '../worker-runtime.js'
import type { ColoringBatchItem, ColoringBatchRequest, ColoringBatchResponse, ColoringBatchResultValue } from './coloring-types.js'

export type ColoringWorkerPool = {
  RunBatch(Items: ColoringBatchItem[]): Promise<ColoringBatchResultValue[]>
  Terminate(): void
}

type PendingResolver = {
  Resolve(Value: ColoringBatchResultValue[]): void
  Reject(Reason: unknown): void
}

function SplitIntoChunks<T>(Items: T[], ChunkCount: number): T[][] {
  const ChunkSize = Math.ceil(Items.length / ChunkCount)
  const Chunks: T[][] = []
  for (let Index = 0; Index < Items.length; Index += ChunkSize) Chunks.push(Items.slice(Index, Index + ChunkSize))
  return Chunks
}

// Registers a single message listener per worker so concurrent RunBatch calls don't leak listeners.
function AttachResponseHandling(WorkerInstance: WorkerLike): Map<string, PendingResolver> {
  const Pending = new Map<string, PendingResolver>()

  WorkerInstance.OnMessage((Data) => {
    const Message = Data as ColoringBatchResponse
    if (!Message || !Message.RequestId) return

    const PendingRequest = Pending.get(Message.RequestId)
    if (!PendingRequest) return
    Pending.delete(Message.RequestId)

    if (Message.Kind === 'batch-result') PendingRequest.Resolve(Message.Results)
    else PendingRequest.Reject(new Error(Message.Error))
  })

  return Pending
}

function RunOnWorker(WorkerInstance: WorkerLike, Pending: Map<string, PendingResolver>, Items: ColoringBatchItem[]): Promise<ColoringBatchResultValue[]> {
  if (Items.length === 0) return Promise.resolve([])

  const RequestId = `coloring-${crypto.randomUUID()}`
  const Request: ColoringBatchRequest = { Kind: 'batch', RequestId, Items }

  return new Promise<ColoringBatchResultValue[]>((Resolve, Reject) => {
    Pending.set(RequestId, { Resolve, Reject })
    WorkerInstance.PostMessage(Request)
  })
}

/** Distributes color/region checks across a pool of Workers (browser) or worker_threads (Node), preserving item order. */
export async function CreateColoringWorkerPool(Code: string, PoolSize: number): Promise<ColoringWorkerPool> {
  if (PoolSize < 1) throw new RangeError('PoolSize must be at least 1')

  const Workers = await Promise.all(Array.from({ length: PoolSize }, () => CreateIsomorphicWorker(Code)))
  const PendingByWorker = Workers.map(AttachResponseHandling)

  return {
    async RunBatch(Items: ColoringBatchItem[]): Promise<ColoringBatchResultValue[]> {
      const Chunks = SplitIntoChunks(Items, Workers.length)
      const ChunkResults = await Promise.all(Chunks.map((Chunk, Index) => RunOnWorker(Workers[Index], PendingByWorker[Index], Chunk)))
      return ChunkResults.flat()
    },
    Terminate() {
      Workers.forEach(WorkerInstance => WorkerInstance.Terminate())
    }
  }
}
