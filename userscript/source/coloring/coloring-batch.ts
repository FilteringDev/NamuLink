import { HexDistance, RegionCentroidRatio } from './coloring.js'
import { CreateColoringWorkerPool, type ColoringWorkerPool } from './coloring-client.js'
import type { ColoringBatchItem } from './coloring-types.js'

// oxlint-disable-next-line namulink/pascal-case -- must match esbuild define key in builder/source/build.ts
declare const __COLORING_WORKER_CODE__: string

export type CentroidPair = {
  Compare: string
  Region: string[]
}

export type DistancePair = {
  Compare: string
  Target: string
}

let CachedPool: Promise<ColoringWorkerPool> | undefined

function PickPoolSize(): number {
  const Concurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined
  if (typeof Concurrency !== 'number' || Number.isFinite(Concurrency) === false) return 2
  return Math.min(Math.max(Math.floor(Concurrency), 1), 4)
}

function GetColoringPool(): Promise<ColoringWorkerPool> {
  if (CachedPool !== undefined) return CachedPool
  const PoolSize = PickPoolSize()
  const Pending = CreateColoringWorkerPool(__COLORING_WORKER_CODE__, PoolSize)
  CachedPool = Pending.catch((ErrorValue) => {
    CachedPool = undefined
    throw ErrorValue
  })
  return CachedPool
}

export function CentroidPairKey(Compare: string, Region: string[]): string {
  return `${Compare}\n${Region.join(',')}`
}

export function DistancePairKey(Compare: string, Target: string): string {
  return `${Compare}\n${Target}`
}

/** Batches RegionCentroidRatio checks in the coloring Worker pool (dedupe by caller). Falls back to direct calls when Worker is unavailable. */
export async function QueryCentroidRatios(Pairs: readonly CentroidPair[]): Promise<Map<string, number>> {
  const ResultByKey = new Map<string, number>()
  if (Pairs.length === 0) return ResultByKey

  const FillDirect = (): void => {
    for (const Pair of Pairs) {
      const Key = CentroidPairKey(Pair.Compare, Pair.Region)
      if (ResultByKey.has(Key) === true) continue
      try {
        ResultByKey.set(Key, RegionCentroidRatio(Pair.Compare, Pair.Region))
      } catch {
        ResultByKey.set(Key, -1)
      }
    }
  }

  try {
    const HasCode = typeof __COLORING_WORKER_CODE__ === 'string' && __COLORING_WORKER_CODE__.length > 0
    if (HasCode === false) {
      FillDirect()
      return ResultByKey
    }
    const Pool = await GetColoringPool()
    const Items: ColoringBatchItem[] = Pairs.map((Pair) => ({ Op: 'RegionCentroidRatio', ComparePointHex: Pair.Compare, RegionPoints: Pair.Region }))
    const Results = await Pool.RunBatch(Items)
    Pairs.forEach((Pair, Index) => {
      const Key = CentroidPairKey(Pair.Compare, Pair.Region)
      const Value = Results[Index]
      ResultByKey.set(Key, typeof Value === 'number' ? Value : -1)
    })
    return ResultByKey
  } catch {
    FillDirect()
    return ResultByKey
  }
}

/** Batches HexDistance checks in the coloring Worker pool (dedupe by caller). Falls back to direct calls when Worker is unavailable. */
export async function QueryHexDistances(Pairs: readonly DistancePair[]): Promise<Map<string, number>> {
  const ResultByKey = new Map<string, number>()
  if (Pairs.length === 0) return ResultByKey

  const FillDirect = (): void => {
    for (const Pair of Pairs) {
      const Key = DistancePairKey(Pair.Compare, Pair.Target)
      if (ResultByKey.has(Key) === true) continue
      try {
        ResultByKey.set(Key, HexDistance(Pair.Compare, Pair.Target))
      } catch {
        ResultByKey.set(Key, Infinity)
      }
    }
  }

  try {
    const HasCode = typeof __COLORING_WORKER_CODE__ === 'string' && __COLORING_WORKER_CODE__.length > 0
    if (HasCode === false) {
      FillDirect()
      return ResultByKey
    }
    const Pool = await GetColoringPool()
    const Items: ColoringBatchItem[] = Pairs.map((Pair) => ({ Op: 'HexDistance', ComparePointHex: Pair.Compare, RegionPoints: [Pair.Target], TargetPointHex: Pair.Target }))
    const Results = await Pool.RunBatch(Items)
    Pairs.forEach((Pair, Index) => {
      const Key = DistancePairKey(Pair.Compare, Pair.Target)
      const Value = Results[Index]
      ResultByKey.set(Key, typeof Value === 'number' ? Value : Infinity)
    })
    return ResultByKey
  } catch {
    FillDirect()
    return ResultByKey
  }
}
