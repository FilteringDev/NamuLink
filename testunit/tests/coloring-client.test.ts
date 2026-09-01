import { test, expect } from 'vitest'
import * as Path from 'node:path'
import * as ESBuild from 'esbuild'
import { IsInsideRegion, RegionCentroidRatio } from '@userscript/coloring/coloring.js'
import { CreateColoringWorkerPool } from '@userscript/coloring/coloring-client.js'
import type { ColoringBatchItem, ColoringBatchResultValue } from '@userscript/coloring/coloring-types.js'

const Regions: Record<string, string[]> = {
  Grayscale: ['#000000', '#ffffff'],
  Warm: ['#ff0000', '#ffff00', '#996633']
}

function BuildDataset(): ColoringBatchItem[] {
  const CandidateColors = ['#000000', '#111111', '#7f7f7f', '#ffffff', '#ff8800', '#336699', '#abcdef', '#123456']
  const Items: ColoringBatchItem[] = []

  for (const ColorHex of CandidateColors) {
    for (const RegionPoints of Object.values(Regions)) {
      Items.push({ Op: 'IsInsideRegion', ComparePointHex: ColorHex, RegionPoints })
      Items.push({ Op: 'RegionCentroidRatio', ComparePointHex: ColorHex, RegionPoints })
    }
  }

  return Items
}

function RunDirectly(Items: ColoringBatchItem[]): ColoringBatchResultValue[] {
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
    target: ['es2024']
  })
  return BuildResult.outputFiles[0].text
}

test('coloring batch logic is deterministic when called directly (no worker)', () => {
  const Items = BuildDataset()
  expect(RunDirectly(Items)).toEqual(RunDirectly(Items))
})

test('CreateColoringWorkerPool spreads a batch across worker_threads and matches direct-call results', async () => {
  const Code = await BuildWorkerCode()

  const Pool = await CreateColoringWorkerPool(Code, 3)
  try {
    const Items = BuildDataset()
    const Results = await Pool.RunBatch(Items)
    expect(Results).toEqual(RunDirectly(Items))
  } finally {
    Pool.Terminate()
  }
})

test('RunBatch resolves to an empty array without posting to any worker', async () => {
  const Pool = await CreateColoringWorkerPool(await BuildWorkerCode(), 2)
  try {
    expect(await Pool.RunBatch([])).toEqual([])
  } finally {
    Pool.Terminate()
  }
})

test('RunBatch rejects when a batch item makes the worker throw', async () => {
  const Pool = await CreateColoringWorkerPool(await BuildWorkerCode(), 1)
  try {
    const BadItem: ColoringBatchItem = { Op: 'IsInsideRegion', ComparePointHex: '#000000', RegionPoints: [] }
    await expect(Pool.RunBatch([BadItem])).rejects.toThrow('RegionPoints must contain at least one color')
  } finally {
    Pool.Terminate()
  }
})

test('CreateColoringWorkerPool rejects a non-positive PoolSize', async () => {
  const Code = await BuildWorkerCode()
  await expect(CreateColoringWorkerPool(Code, 0)).rejects.toThrow(RangeError)
  await expect(CreateColoringWorkerPool(Code, -1)).rejects.toThrow(RangeError)
})
