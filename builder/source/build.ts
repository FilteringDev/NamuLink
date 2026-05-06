import * as ESBuild from 'esbuild'
import * as Zod from 'zod'
import * as Memfs from 'memfs'
import * as TsMorph from 'ts-morph'
import * as Process from 'node:process'
import * as Path from 'node:path'
import * as Fs from 'node:fs/promises'
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

type VirtualFileSystem = ReturnType<typeof Memfs.memfs>['fs']

const VirtualIndexEntryNamespace = 'namulink-virtual-index-entry'
const BuildStartMarker = '// BUILD:START'

function IndentText(Text: string): string {
  return Text.split(/\r?\n/).map(Line => Line.length === 0 ? Line : `  ${Line}`).join('\n')
}

async function CreateVirtualIndexEntry(ProjectRoot: string): Promise<{ EntryPath: string, FileSystem: VirtualFileSystem }> {
  const EntryPath = Path.resolve(ProjectRoot, 'userscript', 'source', 'index.ts')
  const EntryText = await Fs.readFile(EntryPath, 'utf-8')
  const VirtualFileSystem = Memfs.memfs()

  const TsMorphProject = new TsMorph.Project({
    tsConfigFilePath: Path.resolve(ProjectRoot, 'userscript', 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true
  })
  const SourceFile = TsMorphProject.createSourceFile(EntryPath, EntryText, { overwrite: true })
  const BuildStartStatement = SourceFile.getStatementsWithComments().find(Statement => Statement.getText().trim() === BuildStartMarker)

  if (BuildStartStatement === undefined) {
    throw new Error(`Unable to find ${BuildStartMarker} in ${EntryPath}`)
  }

  const Preamble = EntryText.slice(0, BuildStartStatement.getEnd())
  const Body = EntryText.slice(BuildStartStatement.getEnd()).trimStart()
  const WrappedEntryText = `${Preamble}\n\nvoid (async () => {\n${IndentText(Body)}\n})()\n`

  VirtualFileSystem.fs.mkdirSync(Path.dirname(EntryPath), { recursive: true })
  VirtualFileSystem.fs.writeFileSync(EntryPath, WrappedEntryText)

  return {
    EntryPath,
    FileSystem: VirtualFileSystem.fs
  }
}

function CreateVirtualIndexEntryPlugin(EntryPath: string, FileSystem: VirtualFileSystem): ESBuild.Plugin {
  return {
    name: VirtualIndexEntryNamespace,
    setup(Build) {
      Build.onResolve({ filter: /.*/ }, Args => {
        if (Path.resolve(Args.path) !== EntryPath) return

        return {
          path: EntryPath,
          namespace: VirtualIndexEntryNamespace
        }
      })

      Build.onLoad({ filter: /.*/, namespace: VirtualIndexEntryNamespace }, Args => {
        return {
          contents: String(FileSystem.readFileSync(Args.path, 'utf-8')),
          loader: 'ts',
          resolveDir: Path.dirname(EntryPath)
        }
      })
    }
  }
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

  const VirtualIndexEntry = await CreateVirtualIndexEntry(ProjectRoot)

  await ESBuild.build({
    entryPoints: [VirtualIndexEntry.EntryPath],
    bundle: true,
    minify: Options.Minify,
    format: 'iife',
    outfile: `${ProjectRoot}/dist/NamuLink${Options.BuildType === 'development' ? '.dev' : ''}.user.js`,
    banner: {
      js: Banner
    },
    target: ['es2024', 'chrome119', 'firefox142', 'safari26'],
    define: {
      __OCR_WORKER_CODE__: JSON.stringify(WorkerCode.outputFiles[0].text)
    },
    plugins: [
      CreateVirtualIndexEntryPlugin(VirtualIndexEntry.EntryPath, VirtualIndexEntry.FileSystem)
    ]
  })
}
