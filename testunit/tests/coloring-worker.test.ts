import test from 'ava'
import * as Path from 'node:path'
import * as ESBuild from 'esbuild'
import { IsInsideRegion, RegionCentroidRatio } from '@userscript/coloring.js'
import { CreateColoringWorkerPool } from '@userscript/coloring-client.js'
import type { ColoringBatchItem, ColoringBatchResultValue } from '@userscript/coloring-types.js'

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

test('coloring batch logic is deterministic when called directly (no worker)', T => {
  const Items = BuildDataset()
  T.deepEqual(RunDirectly(Items), RunDirectly(Items))
})

test('CreateColoringWorkerPool spreads a batch across worker_threads and matches direct-call results', async T => {
  const EntryPath = Path.resolve(import.meta.dirname, '../../userscript/source/coloring-worker.ts')
  const BuildResult = await ESBuild.build({
    entryPoints: [EntryPath],
    bundle: true,
    write: false,
    external: ['node:worker_threads'],
    target: ['es2024']
  })
  const Code = BuildResult.outputFiles[0].text

  const Pool = await CreateColoringWorkerPool(Code, 3)
  try {
    const Items = BuildDataset()
    const Results = await Pool.RunBatch(Items)
    T.deepEqual(Results, RunDirectly(Items))
  } finally {
    Pool.Terminate()
  }
})
