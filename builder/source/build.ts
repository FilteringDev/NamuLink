import * as RsPack from '@rspack/core'
import * as Memfs from 'memfs'
import * as Zod from 'zod'
import * as Process from 'node:process'
import * as Path from 'node:path'
import PackageJson from '@npmcli/package-json'
import { CreateBanner } from './banner/index.js'
import { SafeInitCwd } from './utils/safe-init-cwd.js'
import { RunCompiler } from './utils/awaited-rspack.js'

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

  const TypescriptLoader = {
    test: /\.ts$/,
    exclude: ['/node_modules/'],
    loader: 'builtin:swc-loader',
    options: {
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
          dynamicImport: true
        }
      }
    },
    type: 'javascript/auto'
  } satisfies RsPack.RuleSetRule

  const WorkerContainer = Memfs.createFsFromVolume(new Memfs.Volume())
  const WorkerBuilder = RsPack.rspack({
    entry: [Path.resolve(ProjectRoot, 'userscript', 'source', 'ocr-worker.ts')],
    mode: Options.BuildType,
    optimization: {
      minimize: Options.Minify
    },
    target: ['es2024', 'webworker'],
    output: {
      path: Path.resolve('/'),
      filename: 'ocr-worker.js'
    },
    resolve: {
      extensions: ['.ts', '.js', '.json'],
      extensionAlias: {
        '.js': ['.ts', '.js']
      }
    },
    module: {
      rules: [TypescriptLoader]
    }
  })
  //@ts-expect-error https://github.com/web-infra-dev/rspack/issues/5091
  WorkerBuilder.outputFileSystem = WorkerContainer
  await RunCompiler(WorkerBuilder)

  const MainBuilder = RsPack.rspack({
    entry: [Path.resolve(ProjectRoot, 'userscript', 'source', 'index.ts')],
    mode: Options.BuildType,
    optimization: {
      minimize: Options.Minify,
      minimizer: [
        new RsPack.SwcJsMinimizerRspackPlugin({
          minimizerOptions: {
            format: {
              comments: 'all'
            }
          }
        })
      ]
    },
    plugins: [
      new RsPack.BannerPlugin({
        banner: Banner,
        raw: true
      }),
      new RsPack.DefinePlugin({
        __OCR_WORKER_CODE__: JSON.stringify(WorkerContainer.readFileSync(Path.resolve('/', 'ocr-worker.js'), 'utf-8'))
      })
    ],
    output: {
      path: Path.resolve(ProjectRoot, 'dist'),
      filename: `NamuLink${Options.BuildType === 'development' ? '.dev' : ''}.user.js`
    },
    resolve: {
      extensions: ['.ts', '.js', '.json'],
      extensionAlias: {
        '.js': ['.ts', '.js']
      }
    },
    module: {
      rules: [TypescriptLoader]
    },
    target: ['es2024', 'web']
  })

  await RunCompiler(MainBuilder)
}