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

const Win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

export function RunNamuLinkUserscript(BrowserWindow: typeof window, UserscriptName: string = 'NamuLink'): void {
  function GetParents(Ele: HTMLElement) {
    let Parents: HTMLElement[] = []
    while (Ele.parentElement) {
      Parents.push(Ele.parentElement)
      Ele = Ele.parentElement
    }
    return Parents
  }

  setInterval(() => {
    if (location.href.startsWith('https://namu.wiki/w/')) {
      let AdContainers = Array.from(document.querySelectorAll('div[class*=" "] div[class]')).filter(AdContainer => AdContainer instanceof HTMLElement)

      AdContainers = AdContainers.filter((AdContainer) => {
        let AdContainerPaddingLeft = Number(getComputedStyle(AdContainer).getPropertyValue('padding-left').replaceAll('px', ''))
        let AdContainerPaddingRight = Number(getComputedStyle(AdContainer).getPropertyValue('padding-right').replaceAll('px', ''))
        let AdContainerPaddingTop = Number(getComputedStyle(AdContainer).getPropertyValue('padding-top').replaceAll('px', ''))
        let AdContainerPaddingBottom = Number(getComputedStyle(AdContainer).getPropertyValue('padding-bottom').replaceAll('px', ''))
        return AdContainerPaddingLeft > 5 && AdContainerPaddingRight > 5 && AdContainerPaddingTop > 5 && AdContainerPaddingBottom > 5
      })

      AdContainers = AdContainers.filter(AdContainer => {
        return Array.from(AdContainer.querySelectorAll('*')).filter(Ele => Ele instanceof HTMLElement &&
          getComputedStyle(Ele).getPropertyValue('animation-timing-function') === 'ease-in-out').length >= 3
      })

      AdContainers = AdContainers.filter(AdContainer => GetParents(AdContainer).some(Parent => Number(getComputedStyle(Parent).getPropertyValue('margin-top').replaceAll('px', '')) > 10 ))

      AdContainers = AdContainers.filter(AdContainer => AdContainer.innerText.length < 1000)

      AdContainers = AdContainers.filter(AdContainer => Array.from(AdContainer.querySelectorAll('*[href="/RecentChanges"]')).filter(Ele => Ele instanceof HTMLElement && getComputedStyle(Ele).getPropertyValue('display') !== 'none').length === 0)

      AdContainers = AdContainers.filter(AdContainer => !AdContainer.innerText.includes((new URL(location.href).searchParams.get('from') || '') + '에서 넘어옴'))

      AdContainers = AdContainers.filter(AdContainer => !/\[[0-9]+\] .+/.test(AdContainer.innerText))

      AdContainers.forEach(Ele => Ele.remove())
    }
  }, 1000)

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
      let StringifiedFunc = ThisArg.toString()
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
      let StringifiedFunc = Args[0].toString()
      if (PowerLinkGenerationSkeletionPositiveRegExps.filter(PowerLinkGenerationSkeletionPositiveRegExp => PowerLinkGenerationSkeletionPositiveRegExp.filter(Index => Index.test(StringifiedFunc)).length >= 1).length === 1) {
        console.debug(`[${UserscriptName}]: setTimeout:`, Args[0])
        return
      }

      return Reflect.apply(Target, ThisArg, Args)
    }
  })
}

RunNamuLinkUserscript(Win)