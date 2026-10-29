import { HexDistance } from '@userscript/coloring/coloring.js'
import { CentroidPairKey, QueryCentroidRatios } from '@userscript/coloring/coloring-batch.js'
import { NamuWikiArticleViewerDarkThemeZone, NamuWikiArticleViewerLightTheme } from '@userscript/PL/color-pattern.js'

export async function SelectNamuLinkArticleViewerColor(Ele: HTMLElement[], GlobalScope: typeof window): Promise<HTMLElement[]> {
  const BackgroundByElement = new Map<HTMLElement, string>()
  const PairList: { Compare: string, Region: string[] }[] = []
  const SeenKeys = new Set<string>()

  for (const El of Ele) {
    const CurrentElementBackgroundColor = GlobalScope.getComputedStyle(El).getPropertyValue('background-color')
    BackgroundByElement.set(El, CurrentElementBackgroundColor)
    const Key = CentroidPairKey(CurrentElementBackgroundColor, NamuWikiArticleViewerDarkThemeZone)
    if (SeenKeys.has(Key) === false) {
      SeenKeys.add(Key)
      PairList.push({ Compare: CurrentElementBackgroundColor, Region: NamuWikiArticleViewerDarkThemeZone })
    }
  }

  const RatioByKey = await QueryCentroidRatios(PairList)

  const Filtered = Ele.filter((El) => {
    const CurrentElementBackgroundColor = BackgroundByElement.get(El) ?? ''
    return HexDistance(CurrentElementBackgroundColor, NamuWikiArticleViewerLightTheme) < 25 ||
      (RatioByKey.get(CentroidPairKey(CurrentElementBackgroundColor, NamuWikiArticleViewerDarkThemeZone)) ?? -1) !== -1
  }).filter((El) => {
    const CurrentElementBounding = El.getBoundingClientRect()
    return CurrentElementBounding.width > 150 && CurrentElementBounding.height > 150
  })
  return Filtered
}