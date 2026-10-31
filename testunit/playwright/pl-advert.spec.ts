import { expect, test } from '@playwright/test'
import * as ESBuild from 'esbuild'
import * as Path from 'node:path'
import { fileURLToPath } from 'node:url'

const SpecDir = Path.dirname(fileURLToPath(import.meta.url))
const ProjectRoot = Path.resolve(SpecDir, '..', '..')
const AdvertEntry = Path.resolve(ProjectRoot, 'userscript', 'source', 'PL', 'advert-entry.ts')

async function BundleAdvert(): Promise<string> {
  const Result = await ESBuild.build({
    entryPoints: [AdvertEntry],
    bundle: true,
    format: 'iife',
    write: false,
    target: ['es2024', 'chrome119'],
    define: { __COLORING_WORKER_CODE__: JSON.stringify('') },
    alias: { '@userscript': Path.resolve(ProjectRoot, 'userscript', 'source') }
  })
  return Result.outputFiles[0].text
}

type FixtureOptions = {
  Edge: string
  TableBackground: string
  RowBackgrounds: string[]
  UseHeaderGroup: boolean
  LinkColors: string[]
}

function FixtureHtml(Options: FixtureOptions): string {
  const Rows = Options.RowBackgrounds.map((Background, Index) => `
    <tr class="pl-row" style="background-color: ${Background};"><td><a class="pl-link" style="color: ${Options.LinkColors[Index % Options.LinkColors.length]};" href="#">ad${Index}</a></td></tr>`).join('')
  const Body = Options.UseHeaderGroup
    ? `<thead><tr class="pl-row" style="background-color: ${Options.RowBackgrounds[0]};"><td><a class="pl-link" style="color: ${Options.LinkColors[0]};" href="#">ad-head</a></td></tr></thead><tbody>${Rows}</tbody>`
    : `<tbody>${Rows}</tbody>`
  return `<!doctype html><html><body>
    <table id="target" style="background-color: ${Options.TableBackground}; border: 1px solid ${Options.Edge}; border-collapse: collapse; width: 400px;">
      ${Body}
    </table>
  </body></html>`
}

// oxlint-disable-next-line namulink/pascal-case -- Playwright fixture name
async function DetectedIds(Page: import('@playwright/test').Page, Bundle: string, Html: string): Promise<string[]> {
  await Page.setContent(Html)
  await Page.addScriptTag({ content: Bundle })
  return Page.evaluate(async () => {
    const All = [...document.querySelectorAll('*')].filter((Child) => Child instanceof HTMLElement)
    // @ts-expect-error injected by bundled entry
    const Found: HTMLElement[] = await window.__PL2_FIND__(All, window)
    return Found.map((Element) => Element.getAttribute('id') ?? Element.tagName.toLowerCase())
  })
}



test('detects light table with tiled tr backgrounds', async ({ page: Page }) => {
  const Bundle = await BundleAdvert()
  const Ids = await DetectedIds(Page, Bundle, FixtureHtml({
    Edge: '#D4D3D4',
    TableBackground: 'transparent',
    RowBackgrounds: ['#F5F5F0', '#FFFFFF'],
    UseHeaderGroup: false,
    LinkColors: ['#018228', '#3F8F0E']
  }))
  expect(Ids).toContain('target')
})

test('detects dark table with thead and tbody tiles', async ({ page: Page }) => {
  const Bundle = await BundleAdvert()
  const Ids = await DetectedIds(Page, Bundle, FixtureHtml({
    Edge: '#484340',
    TableBackground: 'transparent',
    RowBackgrounds: ['#2D2B2B', '#312F33'],
    UseHeaderGroup: true,
    LinkColors: ['#018228', '#469746']
  }))
  expect(Ids).toContain('target')
})

test('ignores table with mismatched edge color', async ({ page: Page }) => {
  const Bundle = await BundleAdvert()
  const Ids = await DetectedIds(Page, Bundle, FixtureHtml({
    Edge: '#ff0000',
    TableBackground: 'transparent',
    RowBackgrounds: ['#F5F5F0', '#FFFFFF'],
    UseHeaderGroup: false,
    LinkColors: ['#018228', '#3F8F0E']
  }))
  expect(Ids).not.toContain('target')
})
