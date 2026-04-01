import * as ESBuild from 'esbuild'
import * as Zod from 'zod'
import * as Process from 'node:process'
import * as Path from 'node:path'
import PackageJson from '@npmcli/package-json'
import { CreateBanner } from './banner/index.js'
import { SafeInitCwd } from './utils/safe-init-cwd.js'

export type BuildOptions = {
  Minify: boolean
  UseCache: boolean
  BuildType: 'production' | 'development',
  SubscriptionUrl: string,
  Version?: string
}

export async function Build(OptionsParam?: BuildOptions): Promise<void> {
  const Options = await Zod.strictObject({
    Minify: Zod.boolean(),
    UseCache: Zod.boolean(),
    BuildType: Zod.enum(['production', 'development']),
    SubscriptionUrl: Zod.string().transform(Value => new URL(Value)).default(new URL('https://cdn.jsdelivr.net/npm/@filteringdev/namulink@latest/dist/NamuLink.user.js')),
    Version: Zod.string().optional()
  }).parseAsync(OptionsParam)

  let MatchingDomains: Set<string> = new Set<string>(['namu.wiki'])

  let ProjectRoot = SafeInitCwd({ Cwd: Process.cwd(), InitCwd: Process.env.INIT_CWD })
  
  const Banner = CreateBanner({
    Version: Options.Version ?? (await PackageJson.load(ProjectRoot)).content.version ?? '0.0.0',
    BuildType: Options.BuildType ?? 'production',
    Domains: MatchingDomains,
    Name: 'NamuLink',
    Namespace: 'https://github.com/FilteringDev/NamuLink',
    DownloadURL: Options.SubscriptionUrl,
    UpdateURL: Options.SubscriptionUrl,
    HomepageURL: new URL('https://github.com/FilteringDev/NamuLink'),
    SupportURL: new URL('https://github.com/FilteringDev/NamuLink/issues'),
    License: 'MPL-2.0',
    Author: 'PiQuark6046 and contributors',
    Description: {
      en: 'NamuLink blocks the PowerLink advertisement on NamuWiki.',
      ko: 'NamuLink는 나무위키에 있는 파워링크 광고를 차단합니다.'
    }
  })

  const WorkerCode = await ESBuild.build({
    entryPoints: [Path.resolve(ProjectRoot, 'userscript', 'source', 'ocr-worker.ts')],
    bundle: true,
    minify: Options.Minify,
    write: false,
    target: ['es2024', 'chrome119', 'firefox142', 'safari26']
  })

  await ESBuild.build({
    entryPoints: [Path.resolve(ProjectRoot, 'userscript', 'source', 'index.ts')],
    bundle: true,
    minify: Options.Minify,
    outfile: `${ProjectRoot}/dist/NamuLink${Options.BuildType === 'development' ? '.dev' : ''}.user.js`,
    banner: {
      js: Banner
    },
    target: ['es2024', 'chrome119', 'firefox142', 'safari26'],
    define: {
      __OCR_WORKER_CODE__: JSON.stringify(WorkerCode.outputFiles[0].text)
    }
  })
}