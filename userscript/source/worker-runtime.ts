// Minimal shape for the subset of worker_threads used here, so this browser-focused package doesn't need @types/node.
type NodeMessagePort = {
  on(EventName: 'message', Listener: (Value: unknown) => void): void
  postMessage(Value: unknown): void
}
// eslint-disable-next-line @typescript-eslint/naming-convention -- must match Node's worker_threads Worker options shape
type NodeWorkerConstructor = new (FileNameOrCode: string, Options?: { eval?: boolean }) => {
  on(EventName: 'message' | 'error', Listener: (Value: unknown) => void): void
  postMessage(Value: unknown): void
  terminate(): Promise<number>
}
type NodeWorkerThreadsModule = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- must match Node's worker_threads export name
  parentPort: NodeMessagePort | null
  Worker: NodeWorkerConstructor
}

// A non-literal specifier keeps TS from statically resolving 'node:worker_threads', which this package has no types for.
const WorkerThreadsModuleName = 'node:worker_threads'

async function ImportWorkerThreads(): Promise<NodeWorkerThreadsModule> {
  return (await import(WorkerThreadsModuleName)) as NodeWorkerThreadsModule
}

export type PortLike = {
  OnMessage(Callback: (Data: unknown) => void): void
  PostMessage(Data: unknown): void
}

export type WorkerLike = PortLike & {
  OnError(Callback: (ErrorValue: unknown) => void): void
  Terminate(): void
}

/** Resolves the current context's message port: browser Worker scope (self) vs Node worker_threads (parentPort). */
export async function GetWorkerPort(): Promise<PortLike> {
  if (typeof self !== 'undefined') {
    return {
      OnMessage(Callback) {
        self.addEventListener('message', (EventValue: MessageEvent) => Callback(EventValue.data))
      },
      PostMessage(Data) {
        self.postMessage(Data)
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention -- must match Node's worker_threads export name
  const { parentPort } = await ImportWorkerThreads()
  if (!parentPort) throw new Error('parentPort is unavailable outside a worker_threads worker')

  return {
    OnMessage(Callback) {
      parentPort.on('message', Callback)
    },
    PostMessage(Data) {
      parentPort.postMessage(Data)
    }
  }
}

/** Instantiates a Worker from inline source: Blob URL in browsers, worker_threads `eval` in Node. */
export async function CreateIsomorphicWorker(Code: string): Promise<WorkerLike> {
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
    const BlobUrl = URL.createObjectURL(new Blob([Code], { type: 'application/javascript' }))
    const WorkerInstance = new Worker(BlobUrl)

    return {
      OnMessage(Callback) {
        WorkerInstance.addEventListener('message', (EventValue: MessageEvent) => Callback(EventValue.data))
      },
      OnError(Callback) {
        WorkerInstance.addEventListener('error', Callback)
      },
      PostMessage(Data) {
        WorkerInstance.postMessage(Data)
      },
      Terminate() {
        WorkerInstance.terminate()
        URL.revokeObjectURL(BlobUrl)
      }
    }
  }

  const { Worker: NodeWorker } = await ImportWorkerThreads()
  const WorkerInstance = new NodeWorker(Code, { eval: true })

  return {
    OnMessage(Callback) {
      WorkerInstance.on('message', Callback)
    },
    OnError(Callback) {
      WorkerInstance.on('error', Callback)
    },
    PostMessage(Data) {
      WorkerInstance.postMessage(Data)
    },
    Terminate() {
      void WorkerInstance.terminate()
    }
  }
}
