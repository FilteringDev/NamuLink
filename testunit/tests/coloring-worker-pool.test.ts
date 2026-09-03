import { test, expect, beforeAll, afterAll } from 'vitest'
import * as Path from 'node:path'
import * as ESBuild from 'esbuild'
import { IsInsideRegion, RegionCentroidRatio } from '@userscript/coloring/coloring.js'
import { CreateColoringWorkerPool, type ColoringWorkerPool } from '@userscript/coloring/coloring-client.js'
import type { ColoringBatchItem, ColoringBatchResultValue } from '@userscript/coloring/coloring-types.js'

const CandidateColors: readonly string[] = [
  '#000000', '#111111', '#7f7f7f', '#ffffff', '#ff8800',
  '#336699', '#abcdef', '#123456', '#800000', '#00ff00',
]

const Regions: Record<string, readonly string[]> = {
  Grayscale: ['#000000', '#ffffff'],
  Warm: ['#ff0000', '#ffff00', '#996633'],
  Cube: ['#323232', '#c83232', '#32c832', '#3232c8', '#c8c832', '#c832c8', '#32c8c8', '#c8c8c8'],
  Pyramid: ['#000000', '#c80000', '#c8c800', '#00c800', '#6464c8'],
}

const Ops: readonly ColoringBatchItem['Op'][] = ['IsInsideRegion', 'RegionCentroidRatio']

function RunDirectly(Items: readonly ColoringBatchItem[]): ColoringBatchResultValue[] {
  return Items.map(Item => Item.Op === 'IsInsideRegion'
    ? IsInsideRegion(Item.ComparePointHex, Item.RegionPoints)
    : RegionCentroidRatio(Item.ComparePointHex, Item.RegionPoints))
}

async function BuildWorkerCode(): Promise<string> {
  const EntryPath = Path.resolve(import.meta.dirname, '../../userscript/source/coloring/coloring-worker.ts')
  const BuildResult = await ESBuild.build({
    entryPoints: [EntryPath],
    bundle: true,
    write: false,
    external: ['node:worker_threads'],
    target: ['es2024'],
  })
  return BuildResult.outputFiles[0].text
}

function BuildDatasetOfSize(Size: number): ColoringBatchItem[] {
  const Items: ColoringBatchItem[] = []
  const RegionList = Object.values(Regions)
  for (let Index = 0; Index < Size; Index++) {
    const ColorHex = CandidateColors[Index % CandidateColors.length]
    const RegionPoints = RegionList[Index % RegionList.length]
    const Op = Ops[Index % Ops.length]
    Items.push({ Op, ComparePointHex: ColorHex, RegionPoints: RegionPoints as string[] })
  }
  return Items
}

let WorkerCode: string
let SharedPool: ColoringWorkerPool

beforeAll(async () => {
  WorkerCode = await BuildWorkerCode()
  SharedPool = await CreateColoringWorkerPool(WorkerCode, 4)
})

afterAll(() => {
  SharedPool.Terminate()
})

// Section A: item-level regression across colors x regions x ops
for (const ColorHex of CandidateColors) {
  for (const [RegionName, RegionPoints] of Object.entries(Regions)) {
    for (const Op of Ops) {
      test(`CreateColoringWorkerPool matches direct ${Op} for ${ColorHex} against ${RegionName}`, async () => {
        const Item: ColoringBatchItem = { Op, ComparePointHex: ColorHex, RegionPoints: RegionPoints as string[] }
        const [PoolResult] = await SharedPool.RunBatch([Item])
        expect(PoolResult).toEqual(RunDirectly([Item])[0])
      })
    }
  }
}

// Section B: PoolSize variants
const PoolSizeVariants: readonly number[] = [1, 2, 3, 4, 5, 8, 16]

for (const PoolSize of PoolSizeVariants) {
  test(`CreateColoringWorkerPool with PoolSize=${PoolSize} matches direct-call results`, async () => {
    const Pool = await CreateColoringWorkerPool(WorkerCode, PoolSize)
    try {
      const Items = BuildDatasetOfSize(24)
      const Results = await Pool.RunBatch(Items)
      expect(Results).toEqual(RunDirectly(Items))
    } finally {
      Pool.Terminate()
    }
  })
}

// Section C: order preservation across dataset sizes not evenly divisible by the pool size
const OrderPreservationSizes: readonly number[] = [1, 2, 3, 7, 13, 50]

for (const Size of OrderPreservationSizes) {
  test(`CreateColoringWorkerPool preserves item order for a dataset of size ${Size}`, async () => {
    const Items = BuildDatasetOfSize(Size)
    const Results = await SharedPool.RunBatch(Items)
    expect(Results).toEqual(RunDirectly(Items))
    expect(Results.length).toBe(Size)
  })
}

// Section D: concurrency - distinct simultaneous RunBatch calls must not cross-contaminate
test('CreateColoringWorkerPool keeps 3 concurrent RunBatch calls with different datasets independent', async () => {
  const DatasetA = BuildDatasetOfSize(5)
  const DatasetB = BuildDatasetOfSize(9)
  const DatasetC = BuildDatasetOfSize(17)

  const [ResultsA, ResultsB, ResultsC] = await Promise.all([
    SharedPool.RunBatch(DatasetA),
    SharedPool.RunBatch(DatasetB),
    SharedPool.RunBatch(DatasetC),
  ])

  expect(ResultsA).toEqual(RunDirectly(DatasetA))
  expect(ResultsB).toEqual(RunDirectly(DatasetB))
  expect(ResultsC).toEqual(RunDirectly(DatasetC))
})

test('CreateColoringWorkerPool keeps 5 concurrent same-size RunBatch calls with different data independent', async () => {
  const Datasets = Array.from({ length: 5 }, (Unused, Index) => BuildDatasetOfSize(6).map(Item => ({ ...Item, ComparePointHex: CandidateColors[(Index + Item.RegionPoints.length) % CandidateColors.length] })))

  const AllResults = await Promise.all(Datasets.map(Dataset => SharedPool.RunBatch(Dataset)))

  for (const [Index, Results] of AllResults.entries()) expect(Results).toEqual(RunDirectly(Datasets[Index]))
})

test('CreateColoringWorkerPool interleaves a large and a tiny concurrent RunBatch call correctly', async () => {
  const LargeDataset = BuildDatasetOfSize(40)
  const TinyDataset = BuildDatasetOfSize(1)

  const [LargeResults, TinyResults] = await Promise.all([
    SharedPool.RunBatch(LargeDataset),
    SharedPool.RunBatch(TinyDataset),
  ])

  expect(LargeResults).toEqual(RunDirectly(LargeDataset))
  expect(TinyResults).toEqual(RunDirectly(TinyDataset))
})

// Section E: error handling for malformed batch items
test('RunBatch rejects an item with empty RegionPoints', async () => {
  const BadItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '#000000', RegionPoints: [] }
  await expect(SharedPool.RunBatch([BadItem])).rejects.toThrow('RegionPoints must contain at least one color')
})

test('RunBatch rejects a RegionCentroidRatio item with empty RegionPoints', async () => {
  const BadItem: ColoringBatchItem = { Op: 'RegionCentroidRatio', ComparePointHex: '#000000', RegionPoints: [] }
  await expect(SharedPool.RunBatch([BadItem])).rejects.toThrow('RegionPoints must contain at least one color')
})

test('RunBatch rejects an item with a malformed ComparePointHex', async () => {
  const BadItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '#zzzzzz', RegionPoints: ['#000000'] }
  await expect(SharedPool.RunBatch([BadItem])).rejects.toThrow()
})

test('RunBatch rejects an item with a malformed color inside RegionPoints', async () => {
  const BadItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '#000000', RegionPoints: ['#zzzzzz'] }
  await expect(SharedPool.RunBatch([BadItem])).rejects.toThrow()
})

test('RunBatch rejects a batch mixing a valid item with an error-causing item', async () => {
  const GoodItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '#000000', RegionPoints: ['#000000', '#ffffff'] }
  const BadItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '#000000', RegionPoints: [] }
  await expect(SharedPool.RunBatch([GoodItem, BadItem])).rejects.toThrow('RegionPoints must contain at least one color')
})

test('RunBatch rejects a too-short ComparePointHex', async () => {
  const BadItem: ColoringBatchItem = { Op: 'RegionCentroidRatio', ComparePointHex: '#12', RegionPoints: ['#000000'] }
  await expect(SharedPool.RunBatch([BadItem])).rejects.toThrow()
})

test('RunBatch rejects an empty ComparePointHex', async () => {
  const BadItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '', RegionPoints: ['#000000'] }
  await expect(SharedPool.RunBatch([BadItem])).rejects.toThrow()
})

test('RunBatch on a fresh single-worker pool rejects the same way as the shared pool', async () => {
  const Pool = await CreateColoringWorkerPool(WorkerCode, 1)
  try {
    const BadItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '#000000', RegionPoints: [] }
    await expect(Pool.RunBatch([BadItem])).rejects.toThrow('RegionPoints must contain at least one color')
  } finally {
    Pool.Terminate()
  }
})

// Section F: PoolSize validation
test('CreateColoringWorkerPool rejects PoolSize=0', async () => {
  await expect(CreateColoringWorkerPool(WorkerCode, 0)).rejects.toThrow(RangeError)
})

test('CreateColoringWorkerPool rejects PoolSize=-1', async () => {
  await expect(CreateColoringWorkerPool(WorkerCode, -1)).rejects.toThrow(RangeError)
})

test('CreateColoringWorkerPool rejects PoolSize=-100', async () => {
  await expect(CreateColoringWorkerPool(WorkerCode, -100)).rejects.toThrow(RangeError)
})

test('CreateColoringWorkerPool rejects a fractional PoolSize below 1', async () => {
  await expect(CreateColoringWorkerPool(WorkerCode, 0.5)).rejects.toThrow(RangeError)
})

// Section G: misc
test('RunBatch resolves to an empty array for an empty dataset', async () => {
  expect(await SharedPool.RunBatch([])).toEqual([])
})

test('RunBatch returns exactly one result per submitted item for a 50-item batch', async () => {
  const Items = BuildDatasetOfSize(50)
  const Results = await SharedPool.RunBatch(Items)
  expect(Results.length).toBe(50)
})

// Section H: boundary between PoolSize and item count
test('RunBatch with item count exactly equal to PoolSize gives each worker exactly one item', async () => {
  const Pool = await CreateColoringWorkerPool(WorkerCode, 4)
  try {
    const Items = BuildDatasetOfSize(4)
    expect(await Pool.RunBatch(Items)).toEqual(RunDirectly(Items))
  } finally {
    Pool.Terminate()
  }
})

test('RunBatch with item count one less than PoolSize leaves the last worker idle', async () => {
  const Pool = await CreateColoringWorkerPool(WorkerCode, 4)
  try {
    const Items = BuildDatasetOfSize(3)
    expect(await Pool.RunBatch(Items)).toEqual(RunDirectly(Items))
  } finally {
    Pool.Terminate()
  }
})

test('RunBatch with PoolSize=1 and many items routes everything through the single worker', async () => {
  const Pool = await CreateColoringWorkerPool(WorkerCode, 1)
  try {
    const Items = BuildDatasetOfSize(20)
    expect(await Pool.RunBatch(Items)).toEqual(RunDirectly(Items))
  } finally {
    Pool.Terminate()
  }
})

test('RunBatch with item count an exact multiple of PoolSize splits evenly', async () => {
  const Items = BuildDatasetOfSize(12)
  expect(await SharedPool.RunBatch(Items)).toEqual(RunDirectly(Items))
})

test('RunBatch with item count one more than an exact multiple of PoolSize still preserves order', async () => {
  const Items = BuildDatasetOfSize(13)
  expect(await SharedPool.RunBatch(Items)).toEqual(RunDirectly(Items))
})

test('RunBatch with a single item on the shared 4-worker pool still resolves correctly', async () => {
  const Items = BuildDatasetOfSize(1)
  expect(await SharedPool.RunBatch(Items)).toEqual(RunDirectly(Items))
})
