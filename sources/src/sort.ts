export function CreateSortWorkerURL() {
  const WorkerCode = `
self.onmessage = (e) => {
  const { entries, jobId } = e.data;
  // entries: Array<[string, number]>
  // 내림차순 정렬
  entries.sort((a, b) => b[1] - a[1]);
  self.postMessage({ jobId, sorted: entries });
};
`
  return URL.createObjectURL(new Blob([WorkerCode], { type: 'text/javascript' }))
}

export function MakeWorkerPool(Size: number) {
  const Url = CreateSortWorkerURL()
  const Workers = Array.from({ length: Size }, () => new Worker(Url))
  return {
    Workers,
    dispose() {
      Workers.forEach(W => W.terminate())
      URL.revokeObjectURL(Url)
    }
  }
}

export function CollectDataVAttributes(Root = document): Record<string, number> {
  const Counts = Object.create(null)

  const Walker = Root.createTreeWalker(
    Root.documentElement || Root,
    NodeFilter.SHOW_ELEMENT
  )

  let Node = Walker.currentNode
  while (Node) {
    if (Node instanceof Element) {
      for (const Attr of Node.attributes) {
        const Name = Attr.name
        if (Name.startsWith('data-v-')) {
          Counts[Name] = (Counts[Name] || 0) + 1
        }
      }
    }
    Node = Walker.nextNode()
  }
  return Counts
}

export function MergeSortedChunks(Chunks: Array<Array<[string, number]>>): Array<[string, number]> {
  // chunks: Array<Array<[string, number]>> 각각 내림차순
  // 결과: 전체 내림차순

  // 간단한 max-heap (count 기준)
  const Heap = []
  function Push(Item) {
    Heap.push(Item)
    let I = Heap.length - 1
    while (I > 0) {
      const P = (I - 1) >> 1
      if (Heap[P].count >= Heap[I].count) break
      [Heap[P], Heap[I]] = [Heap[I], Heap[P]]
      I = P
    }
  };
  function Pop() {
    const Top = Heap[0]
    const Last = Heap.pop()
    if (Heap.length) {
      Heap[0] = Last
      let I = 0
      while (true) {
        const L = I * 2 + 1
        const R = L + 1
        let M = I
        if (L < Heap.length && Heap[L].count > Heap[M].count) M = L
        if (R < Heap.length && Heap[R].count > Heap[M].count) M = R
        if (M === I) break
        [Heap[I], Heap[M]] = [Heap[M], Heap[I]]
        I = M
      }
    }
    return Top
  }

  for (let C = 0; C < Chunks.length; C++) {
    const Arr = Chunks[C]
    if (Arr && Arr.length) {
      const [Attr, Count] = Arr[0]
      Push({ Count, Attr, ChunkIndex: C, IndexInChunk: 0 })
    }
  }

  const Out = []
  while (Heap.length) {
    const { Attr, Count, ChunkIndex, IndexInChunk } = Pop()
    Out.push([Attr, Count])

    const NextIndex = IndexInChunk + 1
    const Arr = Chunks[ChunkIndex]
    if (NextIndex < Arr.length) {
      const [NAttr, NCount] = Arr[NextIndex]
      Push({ Count: NCount, Attr: NAttr, ChunkIndex, IndexInChunk: NextIndex })
    }
  }

  return Out
}

export async function RankCountsWithWorkersParallel(Counts: Record<string, number>) {
  const Entries = Object.entries(Counts) // [attr, count][]

  // 논리 코어 수 기반 워커 개수 결정
  // - 너무 많이 만들면 오히려 역효과라 상한을 둠
  const Hc = Math.max(1, navigator.hardwareConcurrency || 1)
  const WorkerCount = Math.min(8, Math.max(1, Hc - 1))

  // entries가 적으면 병렬화 이득이 거의 없음 → 1개로
  const ShouldParallel = Entries.length >= 5000 && WorkerCount > 1
  const ActualWorkers = ShouldParallel ? WorkerCount : 1
  const Pool = MakeWorkerPool(ActualWorkers)

  try {
    // chunks 분할
    const Chunks = Array.from({ length: ActualWorkers }, () => [])
    for (let I = 0; I < Entries.length; I++) {
      Chunks[I % ActualWorkers].push(Entries[I])
    }

    // 각 워커에 정렬 요청
    const SortedChunks = await Promise.all(
      Chunks.map((ChunkEntries, Idx) => {
        return new Promise<Array<[string, number]>>((Resolve, Reject) => {
          const Worker = Pool.Workers[Idx]
          const JobId = Idx + ':' + Date.now()

          const OnMsg = (E) => {
            if (E.data?.jobId !== JobId) return
            Worker.removeEventListener('message', OnMsg)
            Worker.removeEventListener('error', OnErr)
            Resolve(E.data.sorted)
          }
          const OnErr = (Err) => {
            Worker.removeEventListener('message', OnMsg)
            Worker.removeEventListener('error', OnErr)
            Reject(Err)
          }

          Worker.addEventListener('message', OnMsg)
          Worker.addEventListener('error', OnErr)
          Worker.postMessage({ entries: ChunkEntries, jobId: JobId })
        })
      })
    )
    // 병합해서 전체 순위 생성
    const Merged = (SortedChunks.length === 1)
      ? SortedChunks[0]
      : MergeSortedChunks(SortedChunks)

    return { Result: Merged, TotalKeys: Merged.length, WorkerCount: ActualWorkers, HardwareConcurrency: Hc }
  } finally {
    Pool.dispose()
  }
}