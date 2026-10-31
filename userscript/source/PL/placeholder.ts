import { type MethodCallDetailOf } from '@userscript/event-attacher.js'
import { DistancePairKey, QueryHexDistances, type DistancePair } from '@userscript/coloring/coloring-batch.js'

type StyleSnapshot = {
  Element: HTMLElement
  Tag: string
  Background: string
  Width: number
  Height: number
  MarginTop: number
  MarginBottom: number
  TextLength: number
}

const ExcludedPlaceholderTags: ReadonlySet<string> = new Set(['blockquote', 'q', 'cite'])
const PlaceholderMaxTextLength = 30
const PlaceholderBackgroundMaxDistance = 10

async function FindPL2Placeholder(Ele: HTMLElement[], GlobalScope: typeof window = window): Promise<HTMLElement[]> {
  const Snapshots: StyleSnapshot[] = Ele.map((VEle) => {
    const CurrentStyle = GlobalScope.getComputedStyle(VEle)
    const CurrentRect = VEle.getBoundingClientRect()
    return {
      Element: VEle,
      Tag: VEle.tagName.toLowerCase(),
      Background: CurrentStyle.getPropertyValue('background-color'),
      Width: CurrentRect.width,
      Height: CurrentRect.height,
      MarginTop: parseFloat(CurrentStyle.getPropertyValue('margin-top')),
      MarginBottom: parseFloat(CurrentStyle.getPropertyValue('margin-bottom')),
      TextLength: (VEle.textContent ?? '').trim().length
    }
  })

  const Candidates = Snapshots.filter((Snapshot) => {
    if (ExcludedPlaceholderTags.has(Snapshot.Tag) === true) return false
    if (Snapshot.TextLength > PlaceholderMaxTextLength) return false
    if (Snapshot.Height === 0 || Snapshot.Width === 0) return false
    if (Snapshot.Width / Snapshot.Height < 1) return false
    if (Snapshot.Width / Snapshot.Height > 2) return false
    if (/rgba?\([0-9]+, *[0-9]+, *[0-9]+, *0\)/.test(Snapshot.Background)) return false
    return Snapshot.MarginBottom >= 10 || Snapshot.MarginTop >= 10
  })

  if (Candidates.length === 0) return []

  const Targets = ['#F5F5F5', '#000000']

  const PairList: DistancePair[] = []
  const SeenKeys = new Set<string>()
  const AddPair = (Compare: string, Target: string): void => {
    const Key = DistancePairKey(Compare, Target)
    if (SeenKeys.has(Key) === true) return
    SeenKeys.add(Key)
    PairList.push({ Compare, Target })
  }

  for (const Candidate of Candidates) {
    for (const Target of Targets) AddPair(Candidate.Background, Target)
  }

  const DistanceByKey = await QueryHexDistances(PairList)

  return Candidates.filter((Candidate) => {
    return Targets.some((Target) => (DistanceByKey.get(DistancePairKey(Candidate.Background, Target)) ?? Infinity) < 15)
  }).map((Candidate) => Candidate.Element)
}

export function PL2PlaceholderHook(Eve: CustomEvent<MethodCallDetailOf<typeof window, 'fetch'>>, GlobalScope: typeof window = window): void {
  const AllHTMLElement = [...new Set(GlobalScope.document.querySelectorAll('*'))].filter((Child) => Child instanceof HTMLElement)
  void FindPL2Placeholder(AllHTMLElement, GlobalScope).then((TargetedHTMLElement) => {
    GlobalScope.setInterval(() => {
      TargetedHTMLElement.forEach(VHTMLElement => VHTMLElement.style.setProperty('display', 'none'))
    }, 1000)
  })
}