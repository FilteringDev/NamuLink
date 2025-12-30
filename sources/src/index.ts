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

  let PowerLinkGenerationPositiveRegExps: RegExp[][] = [[
    /for *\( *; *; *\) *switch *\( *_[a-z0-9]+\[_[a-z0-9]+\([a-z0-9]+\)\] *=_[a-z0-9]+/,
    /_[a-z0-9]+\[('|")[A-Z]+('|")\]\)\(\[ *\]\)/,
    /0x[a-z0-9]+ *\) *; *case/
  ], [
    /; *return *this\[_0x[a-z0-9]+\( *0x[0-9a-z]+ *\)/,
    /; *if *\( *_0x[a-z0-9]+ *&& *\( *_0x[a-z0-9]+ *= *_0x[a-z0-9]+/,
    /\) *, *void *\( *this *\[ *_0x[a-z0-9]+\( *0x[0-9a-z]+ *\) *\] *= *_0x[a-z0-9]+ *\[/
  ]]

  BrowserWindow.Function.prototype.bind = new Proxy(BrowserWindow.Function.prototype.bind, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      apply(Target: typeof Function.prototype.bind, ThisArg: Function, Args: Parameters<typeof Function.prototype.bind>) {
        let StringifiedFunc = Reflect.apply(ProtectedFunctionPrototypeToString, ThisArg, Args) as string
        if (PowerLinkGenerationPositiveRegExps.filter(PowerLinkGenerationPositiveRegExp => PowerLinkGenerationPositiveRegExp.filter(Index => Index.test(StringifiedFunc)).length >= 3).length === 1) {
          console.debug(`[${UserscriptName}]: Function.prototype.bind:`, ThisArg)
          return Reflect.apply(Target, () => {}, [])
        }
        return Reflect.apply(Target, ThisArg, Args)
      }
    })

  let PowerLinkGenerationSkeletionPositiveRegExps: RegExp[][] = [[
    /\( *\) *=> *{ *var *_0x[0-9a-z]+ *= *a0_0x[0-9a-f]+ *; *this\[ *_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\]\(\); *}/,
    /\( *\) *=> *{ *var *_0x[0-9a-z]+ *= *a0_0x[0-9a-f]+ *; *this\[ *_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\]\(\); *}/
  ], [
    /\( *\) *=> *{ *var _0x[a-z0-9]+ *= *_0x[a-z0-9]+ *; *if *\( *this\[ *_0x[a-z0-9]+ *\( *0x[0-9a-f]+ *\) *\] *\) *return *clearTimeout/,
    /\( *0x[0-9a-f]+ *\) *\] *\) *, *void *\( *this\[ *_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\] *= *void *\([x0-9a-f*+-]+ *\) *\) *; *this\[_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\] *\(\) *;/
  ]]

  BrowserWindow.setTimeout = new Proxy(BrowserWindow.setTimeout, {
    apply(Target: typeof setTimeout, ThisArg: undefined, Args: Parameters<typeof setTimeout>) {
      let StringifiedFunc = Reflect.apply(ProtectedFunctionPrototypeToString, Args[0], Args) as string
      if (PowerLinkGenerationSkeletionPositiveRegExps.filter(PowerLinkGenerationSkeletionPositiveRegExp => PowerLinkGenerationSkeletionPositiveRegExp.filter(Index => Index.test(StringifiedFunc)).length >= 1).length === 1) {
        console.debug(`[${UserscriptName}]: setTimeout:`, Args[0])
        return
      }

      return Reflect.apply(Target, ThisArg, Args)
    }
  })

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

  const Handler = async () => {
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
    TargetedAttrsDOMs = TargetedAttrsDOMs.filter(El => [...El.querySelectorAll('*')].some(Child => Child instanceof HTMLElement && getComputedStyle(Child, '::after').getPropertyValue('content').includes(':') && Child.getBoundingClientRect().right - Child.getBoundingClientRect().left > 20) === false)
    console.debug(`[${UserscriptName}]`, TargetedAttrsDOMs)
    TargetedAttrsDOMs.forEach(El => {
      setInterval(() => {
        El.setAttribute('style', 'display: none !important; visibility: hidden !important;')
      }, 250)
    })
  }

  window.addEventListener('SpaRendered', () => setTimeout(Handler, 2500))
  window.addEventListener('SpaRendered', Handler)
}

RunNamuLinkUserscript(Win)