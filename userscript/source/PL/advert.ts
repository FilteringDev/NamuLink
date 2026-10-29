import { type MethodCallDetailOf } from '@userscript/event-attacher.js'
import {
  PL2ContainerLightEdgeZone,
  PL2ContainerDarkEdgeZone,
  PL2GreenLinkColorZone,
  PL2ContainerDarkBackgroundZone,
  PL2ContainerLightBackgroundZone
} from './color-pattern.js'
import { CentroidPairKey, QueryCentroidRatios, type CentroidPair } from '@userscript/coloring/coloring-batch.js'

type StyleSnapshot = {
  Element: HTMLElement
  Background: string
  Borders: readonly [string, string, string, string]
}

type ChildColorEntry = {
  Owner: StyleSnapshot
  Color: string
}

async function FindPL2Container(Ele: HTMLElement[], GlobalScope: typeof window = window): Promise<HTMLElement[]> {
  const BackgroundZones = [PL2ContainerDarkBackgroundZone, PL2ContainerLightBackgroundZone]
  const EdgeZones = [PL2ContainerDarkEdgeZone, PL2ContainerLightEdgeZone]

  const Snapshots: StyleSnapshot[] = Ele.map((VEle) => {
    const CurrentStyle = GlobalScope.getComputedStyle(VEle)
    return {
      Element: VEle,
      Background: CurrentStyle.getPropertyValue('background-color'),
      Borders: [
        CurrentStyle.getPropertyValue('border-bottom-color'),
        CurrentStyle.getPropertyValue('border-top-color'),
        CurrentStyle.getPropertyValue('border-left-color'),
        CurrentStyle.getPropertyValue('border-right-color')
      ]
    }
  })

  const PairList: CentroidPair[] = []
  const SeenKeys = new Set<string>()
  const AddPair = (Compare: string, Region: string[]): void => {
    const Key = CentroidPairKey(Compare, Region)
    if (SeenKeys.has(Key) === true) return
    SeenKeys.add(Key)
    PairList.push({ Compare, Region })
  }

  for (const Snapshot of Snapshots) {
    for (const Zone of BackgroundZones) AddPair(Snapshot.Background, Zone)
    for (const Border of Snapshot.Borders) {
      for (const Zone of EdgeZones) AddPair(Border, Zone)
    }
  }

  const RatioByKey = await QueryCentroidRatios(PairList)

  const Candidates = Snapshots.filter((Snapshot) => {
    const HasBackground = BackgroundZones.some((Zone) => (RatioByKey.get(CentroidPairKey(Snapshot.Background, Zone)) ?? -1) !== -1)
    if (HasBackground === false) return false
    return EdgeZones.some((Zone) => Snapshot.Borders.every((Border) => (RatioByKey.get(CentroidPairKey(Border, Zone)) ?? -1) !== -1))
  })

  if (Candidates.length === 0) return []

  const LinkPairs: CentroidPair[] = []
  const SeenLinkKeys = new Set<string>()
  const ChildColors: ChildColorEntry[] = []

  for (const Candidate of Candidates) {
    const Children = [...new Set(Candidate.Element.querySelectorAll('*'))].filter((Child) => Child instanceof HTMLElement)
    for (const Child of Children) {
      const ChildStyle = GlobalScope.getComputedStyle(Child)
      const ChildColor = ChildStyle.getPropertyValue('color')
      ChildColors.push({ Owner: Candidate, Color: ChildColor })
      const Key = CentroidPairKey(ChildColor, PL2GreenLinkColorZone)
      if (SeenLinkKeys.has(Key) === false) {
        SeenLinkKeys.add(Key)
        LinkPairs.push({ Compare: ChildColor, Region: PL2GreenLinkColorZone })
      }
    }
  }

  if (ChildColors.length === 0) return []

  const LinkRatioByKey = await QueryCentroidRatios(LinkPairs)

  const MatchCountByElement = new Map<HTMLElement, number>()
  for (const Entry of ChildColors) {
    const Ratio = LinkRatioByKey.get(CentroidPairKey(Entry.Color, PL2GreenLinkColorZone)) ?? -1
    if (Ratio !== -1) MatchCountByElement.set(Entry.Owner.Element, (MatchCountByElement.get(Entry.Owner.Element) ?? 0) + 1)
  }

  return Candidates.filter((Candidate) => (MatchCountByElement.get(Candidate.Element) ?? 0) >= 2).map((Candidate) => Candidate.Element)
}

export function PL2AdvertHook(Eve: CustomEvent<MethodCallDetailOf<typeof window, 'fetch'>>, GlobalScope: typeof window = window): void {
  const AllHTMLElement = [...new Set(GlobalScope.document.querySelectorAll('*'))].filter((Child) => Child instanceof HTMLElement)
  void FindPL2Container(AllHTMLElement, GlobalScope).then((TargetedHTMLElement) => {
    GlobalScope.setInterval(() => {
      TargetedHTMLElement.forEach(VHTMLElement => VHTMLElement.style.setProperty('display', 'none'))
    }, 1000)
  })
}