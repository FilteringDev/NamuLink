/*!
 * @license MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Contributors:
 *   - See Git history at https://github.com/FilteringDev/tinyShield for detailed authorship information.
 */

type unsafeWindow = typeof window
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const unsafeWindow: unsafeWindow
import * as SPA from './spa.js'
import * as Sort from './sort.js'

const Win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

export function RunNamuLinkUserscript(BrowserWindow: typeof window, UserscriptName: string = 'NamuLink'): void {
  const ProtectedFunctionPrototypeToString = BrowserWindow.Function.prototype.toString

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => {
      SPA.InstallSpaNavigationBridge({
      Root: () => document.getElementById('#app'),
      StableForMs: 900,
      SampleWindowMs: 900,
      Threshold: 3,
      TimeoutMs: 12000,
      IgnoreMutation: SPA.DefaultIgnoreMutation,
      WatchHashChange: true
    })
  })
  } else {
    // 이미 DOMContentLoaded 이후
    window.addEventListener('DOMContentLoaded', () => {
      SPA.InstallSpaNavigationBridge({
      Root: () => document.getElementById('#app'),
      StableForMs: 900,
      SampleWindowMs: 900,
      Threshold: 3,
      TimeoutMs: 12000,
      IgnoreMutation: SPA.DefaultIgnoreMutation,
      WatchHashChange: true
      })
    })
  }

  window.addEventListener('SpaRendered', async () => {
    let HTMLEle = Sort.CollectDataVAttributes(document)
    const { Result, TotalKeys, WorkerCount, HardwareConcurrency } = await Sort.RankCountsWithWorkersParallel(HTMLEle)
    let TargetedAttrsDOMs: HTMLElement[] = []
    Result.filter(([, Count]) => Count <= 30).forEach(([Attr, Count]) => {
      TargetedAttrsDOMs.push(...[...document.querySelectorAll(`[${Attr}]`)].filter((El) => El instanceof HTMLElement))
    })
    TargetedAttrsDOMs = TargetedAttrsDOMs.filter(El => getComputedStyle(El).getPropertyValue('display') === 'flex')
    TargetedAttrsDOMs = TargetedAttrsDOMs.filter(El => [...El.querySelectorAll('*')].some(Child => Child instanceof HTMLElement && typeof Child.click === 'function'))
    TargetedAttrsDOMs = TargetedAttrsDOMs.filter(El => [...El.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement && Child.getBoundingClientRect().bottom - Child.getBoundingClientRect().top > 100 && Child.getBoundingClientRect().right - Child.getBoundingClientRect().left > 100).length <= 50)
    TargetedAttrsDOMs = TargetedAttrsDOMs.filter(El => {
      let Count = [...El.querySelectorAll('*')].filter(Child => (Child.getBoundingClientRect().bottom - Child.getBoundingClientRect().top > 25 && Child.getBoundingClientRect().right - Child.getBoundingClientRect().left > 25 && (Child instanceof SVGPathElement && Child.getAttribute('d') !== null) || (Child instanceof HTMLImageElement && Child.src.includes('//i.namu.wiki/i/')))).length
      return 1 <= Count && Count <= 6
    })
    TargetedAttrsDOMs = TargetedAttrsDOMs.filter(El => [...El.querySelectorAll('*')].some(Child => Child instanceof HTMLElement && getComputedStyle(Child, '::after').getPropertyValue('content').includes(':') && Child.getBoundingClientRect().right - Child.getBoundingClientRect().left > 100) === false)
    console.debug(`[${UserscriptName}]`, TargetedAttrsDOMs)
    TargetedAttrsDOMs.forEach(El => {
      setTimeout(() => {
        El.setAttribute('style', 'display: none !important; visibility: hidden !important;')
      }, 250)
    })
  })
}

RunNamuLinkUserscript(Win)