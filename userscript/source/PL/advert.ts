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

type RowSnapshot = {
  Element: HTMLElement
  Background: string
  Width: number
  Height: number
  Top: number
  Left: number
  Right: number
  Bottom: number
}

export type AdvertParentPredicate = (Candidate: HTMLElement) => boolean

function ExpandToMatchingParent(Advert: HTMLElement, Predicate: AdvertParentPredicate): HTMLElement {
  let Current: HTMLElement | null = Advert.parentElement
  while (Current !== null) {
    if (Predicate(Current) === true) return Current
    if (Current === Current.ownerDocument.body || Current === Current.ownerDocument.documentElement) break
    Current = Current.parentElement
  }
  return Advert
}

function ExpandAdvertParents(Adverts: readonly HTMLElement[], Predicate?: AdvertParentPredicate): HTMLElement[] {
  if (Predicate === undefined) return [...Adverts]
  return [...new Set(Adverts.map((Advert) => ExpandToMatchingParent(Advert, Predicate)))]
}

const TransparentBackgroundPattern = /rgba?\([0-9]+, *[0-9]+, *[0-9]+, *0(\.0+)?\)/

function IsTransparentBackground(Background: string): boolean {
  const Normalized = Background.trim().toLowerCase()
  if (Normalized === 'transparent') return true
  return TransparentBackgroundPattern.test(Normalized)
}

function AreSimilarWidths(Widths: readonly number[]): boolean {
  if (Widths.length === 0) return false
  const Min = Math.min(...Widths)
  const Max = Math.max(...Widths)
  if (Min <= 0) return false
  const Tolerance = Math.max(2, Min * 0.05)
  return Max - Min <= Tolerance
}

function AreSimilarHeights(Heights: readonly number[]): boolean {
  return AreSimilarWidths(Heights)
}

type ContainerRect = {
  Left: number
  Top: number
  Right: number
  Bottom: number
  Width: number
  Height: number
}

function CoversContainer(ContainerRect: ContainerRect, Tiles: readonly RowSnapshot[]): boolean {
  if (Tiles.length === 0) return false
  if (ContainerRect.Width <= 0 || ContainerRect.Height <= 0) return false
  const MinLeft = Math.min(...Tiles.map((Tile) => Tile.Left))
  const MaxRight = Math.max(...Tiles.map((Tile) => Tile.Right))
  const MinTop = Math.min(...Tiles.map((Tile) => Tile.Top))
  const MaxBottom = Math.max(...Tiles.map((Tile) => Tile.Bottom))
  const ToleranceX = Math.max(2, ContainerRect.Width * 0.05)
  const ToleranceY = Math.max(2, ContainerRect.Height * 0.05)
  return MinLeft <= ContainerRect.Left + ToleranceX
    && MaxRight >= ContainerRect.Right - ToleranceX
    && MinTop <= ContainerRect.Top + ToleranceY
    && MaxBottom >= ContainerRect.Bottom - ToleranceY
}

function HasBackgroundInZone(Background: string, Zone: string[], RatioByKey: ReadonlyMap<string, number>): boolean {
  return (RatioByKey.get(CentroidPairKey(Background, Zone)) ?? -1) !== -1
}

function MatchesEdgeZone(Snapshot: StyleSnapshot, Zone: string[], RatioByKey: ReadonlyMap<string, number>): boolean {
  return Snapshot.Borders.every((Border) => HasBackgroundInZone(Border, Zone, RatioByKey))
}

function SnapshotRow(RowElement: HTMLElement, GlobalScope: typeof window): RowSnapshot {
  const RowStyle = GlobalScope.getComputedStyle(RowElement)
  const RowRect = RowElement.getBoundingClientRect()
  return {
    Element: RowElement,
    Background: RowStyle.getPropertyValue('background-color'),
    Width: RowRect?.width ?? 0,
    Height: RowRect?.height ?? 0,
    Top: RowRect?.top ?? 0,
    Left: RowRect?.left ?? 0,
    Right: (RowRect?.left ?? 0) + (RowRect?.width ?? 0),
    Bottom: (RowRect?.top ?? 0) + (RowRect?.height ?? 0)
  }
}

function SnapshotContainerRect(Element: HTMLElement): ContainerRect {
  const Rect = Element.getBoundingClientRect()
  const Width = Rect?.width ?? 0
  const Height = Rect?.height ?? 0
  const Left = Rect?.left ?? 0
  const Top = Rect?.top ?? 0
  return { Left, Top, Right: Left + Width, Bottom: Top + Height, Width, Height }
}

function CollectTileSnapshots(Container: HTMLElement, GlobalScope: typeof window): RowSnapshot[] {
  const RowElements = [...new Set(Container.querySelectorAll('tr, tbody, thead, tfoot'))].filter((Child) => Child instanceof HTMLElement).filter((RowElement) => RowElement.closest('table') === Container || (Container.tagName.toLowerCase() !== 'table' && RowElement.closest('table') === null))
  const LeafRows = RowElements.filter((RowElement) => RowElements.every((Other) => Other === RowElement || !Other.contains(RowElement)))
  const EffectiveLeafRows = LeafRows.length > 0 ? LeafRows : RowElements
  if (EffectiveLeafRows.length > 0) return EffectiveLeafRows.map((RowElement) => SnapshotRow(RowElement, GlobalScope))
  if (Container.tagName.toLowerCase() === 'table') return []
  const Tiles: RowSnapshot[] = []
  const Queue: HTMLElement[] = [...Container.children].filter((Child): Child is HTMLElement => Child instanceof HTMLElement)
  const Seen = new Set<HTMLElement>()
  while (Queue.length > 0) {
    const Current = Queue.shift()
    if (Current === undefined || Seen.has(Current) === true) continue
    Seen.add(Current)
    const Snapshot = SnapshotRow(Current, GlobalScope)
    if (IsTransparentBackground(Snapshot.Background) === true) {
      for (const Child of Current.children) {
        if (Child instanceof HTMLElement) Queue.push(Child)
      }
      continue
    }
    if (Snapshot.Width <= 0 || Snapshot.Height <= 0) continue
    Tiles.push(Snapshot)
  }
  return Tiles
}

async function FindPromotedTables(EdgeOnlyContainers: StyleSnapshot[], RatioByKey: ReadonlyMap<string, number>, GlobalScope: typeof window = window): Promise<StyleSnapshot[]> {
  if (EdgeOnlyContainers.length === 0) return []

  const BackgroundZones = [PL2ContainerDarkBackgroundZone, PL2ContainerLightBackgroundZone]
  const EdgeZones = [PL2ContainerDarkEdgeZone, PL2ContainerLightEdgeZone]

  const RowSnapshotsByOwner = new Map<StyleSnapshot, RowSnapshot[]>()
  const ContainerRectByOwner = new Map<StyleSnapshot, ContainerRect>()
  const RowPairList: CentroidPair[] = []
  const SeenRowKeys = new Set<string>()
  const AddRowPair = (Compare: string, Region: string[]): void => {
    const Key = CentroidPairKey(Compare, Region)
    if (SeenRowKeys.has(Key) === true) return
    SeenRowKeys.add(Key)
    RowPairList.push({ Compare, Region })
  }

  for (const ContainerSnapshot of EdgeOnlyContainers) {
    const TileSnapshots = CollectTileSnapshots(ContainerSnapshot.Element, GlobalScope)
    RowSnapshotsByOwner.set(ContainerSnapshot, TileSnapshots)
    ContainerRectByOwner.set(ContainerSnapshot, SnapshotContainerRect(ContainerSnapshot.Element))
    for (const TileSnapshot of TileSnapshots) {
      for (const Zone of BackgroundZones) AddRowPair(TileSnapshot.Background, Zone)
    }
  }

  const RowRatioByKey = await QueryCentroidRatios(RowPairList)

  return EdgeOnlyContainers.filter((ContainerSnapshot) => {
    const MatchedEdgeZones = EdgeZones.filter((Zone) => MatchesEdgeZone(ContainerSnapshot, Zone, RatioByKey))
    if (MatchedEdgeZones.length === 0) return false

    const Tiles = RowSnapshotsByOwner.get(ContainerSnapshot) ?? []
    if (Tiles.length < 2) return false
    const ContainerRect = ContainerRectByOwner.get(ContainerSnapshot)
    if (ContainerRect === undefined) return false
    if (CoversContainer(ContainerRect, Tiles) === false) return false
    const TilesArea = Tiles.reduce((Total, Tile) => Total + Tile.Width * Tile.Height, 0)
    if (TilesArea < ContainerRect.Width * ContainerRect.Height * 0.7) return false
    const Widths = Tiles.map((Tile) => Tile.Width)
    const Heights = Tiles.map((Tile) => Tile.Height)
    if (AreSimilarWidths(Widths) === false && AreSimilarHeights(Heights) === false) return false

    return MatchedEdgeZones.some((EdgeZone) => {
      const PairedBackgroundZone = EdgeZone === PL2ContainerLightEdgeZone ? PL2ContainerLightBackgroundZone : PL2ContainerDarkBackgroundZone
      return Tiles.every((Tile) => HasBackgroundInZone(Tile.Background, PairedBackgroundZone, RowRatioByKey) === true)
    })
  })
}

async function FindPL2Container(Ele: HTMLElement[], GlobalScope: typeof window = window, ParentPredicate?: AdvertParentPredicate): Promise<HTMLElement[]> {
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

  const DirectCandidates = Snapshots.filter((Snapshot) => {
    const HasBackground = BackgroundZones.some((Zone) => HasBackgroundInZone(Snapshot.Background, Zone, RatioByKey) === true)
    if (HasBackground === false) return false
    return EdgeZones.some((Zone) => MatchesEdgeZone(Snapshot, Zone, RatioByKey) === true)
  })

  const EdgeOnlyContainers = Snapshots.filter((Snapshot) => {
    const HasBackground = BackgroundZones.some((Zone) => HasBackgroundInZone(Snapshot.Background, Zone, RatioByKey) === true)
    if (HasBackground === true) return false
    return EdgeZones.some((Zone) => MatchesEdgeZone(Snapshot, Zone, RatioByKey) === true)
  })

  const PromotedTables = await FindPromotedTables(EdgeOnlyContainers, RatioByKey, GlobalScope)

  const Candidates = [...new Set([...DirectCandidates, ...PromotedTables])]

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

  const MatchedAdverts = Candidates.filter((Candidate) => (MatchCountByElement.get(Candidate.Element) ?? 0) >= 2).map((Candidate) => Candidate.Element)
  return ExpandAdvertParents(MatchedAdverts, ParentPredicate)
}

export function PL2AdvertHook(Eve: CustomEvent<MethodCallDetailOf<typeof window, 'fetch'>>, GlobalScope: typeof window = window, ParentPredicate?: AdvertParentPredicate): void {
  const AllHTMLElement = [...new Set(GlobalScope.document.querySelectorAll('*'))].filter((Child) => Child instanceof HTMLElement)
  void FindPL2Container(AllHTMLElement, GlobalScope, ParentPredicate).then((TargetedHTMLElement) => {
    GlobalScope.setInterval(() => {
      TargetedHTMLElement.forEach(VHTMLElement => VHTMLElement.style.setProperty('display', 'none'))
    }, 1000)
  })
}