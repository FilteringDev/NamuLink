/*!
 * @license MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Contributors:
 *   - See Git history at https://github.com/FilteringDev/NamuLink for detailed authorship information.
 */

type unsafeWindow = typeof window
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const unsafeWindow: unsafeWindow

const Win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

export function RunNamuLinkUserscript(BrowserWindow: typeof window, UserscriptName: string = 'NamuLink'): void {    
  const OriginalFunctionPrototypeCall = BrowserWindow.Function.prototype.call
  const OriginalReflectApply = BrowserWindow.Reflect.apply
  let PL2Event = new CustomEvent('PL2PlaceHolder')

  const PL2MajorFuncCallPatterns: RegExp[][] = [[
    /function *\( *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *\) *{ *var *_0x[a-f0-9]+/,
    /('|")td('|") *, *{ *('|")class('|") *: *\( *-? *0x[a-f0-9]+ *\+ *-? *0x[a-f0-9]+ *\+ *0x[a-f0-9]+ *, *_0x[a-f0-9]+ *\[ *_0x[a-f0-9]+ */,
    /\( *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\) *, *('|")onClick('|") *: *_0x[a-f0-9]+ *\[ *-? *0x[a-f0-9]+ *\* *-? *0x[a-f0-9]+/,
    /_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\) *, *('|")colspan('|") *: *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *=== *_0x[a-f0-9]+ *\[ *_0x[a-f0-9]+ *\(/
  ], [
    /function *\( *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *\) *{ *var *_0x[a-f0-9]+/,
    /\( *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\) *, *('|")onClick('|") *: *_0x[a-f0-9]+ *\[ *-? *0x[a-f0-9]+ *\* *-? *0x[a-f0-9]+/,
    /_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\] *\) *\( *_0x[a-f0-9]+ *=> *_0x[a-f0-9]+ *\[ *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\] *\( *_0x[a-f0-9]+/,
    / *, *{ *('|")class('|") *: *\( *-? *0x[a-f0-9,_+*x-]+ *\[ *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\] *\) *\( *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\) *} *, *\[ *! *_0x[a-f0-9]+/
  ]]
  const FalsePositiveSignPatterns: RegExp[][] = [[
    /new *Map *\( *Object *\[ *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\] *\( *{ *('|")pretendard('|") *: *{ *('|")fontFamily('|") *: */,
    /('|")fontFamily('|") *: *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *, *('|")styleUrl('|") *: *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *, *('|")isGoogleFonts/,
    /('|")popper--wide('|") *: *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *, *('|")popper__title('|") *: *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *} *} *,/
  ]]

  let InHook = false
  BrowserWindow.Function.prototype.call = new Proxy(OriginalFunctionPrototypeCall, {
    apply(Target: typeof Function.prototype.call, ThisArg: unknown, Args: unknown[]) {
      // Prevent infinite recursion when the hook itself calls Function.prototype.call
      if (InHook) {
        return OriginalReflectApply(Target, ThisArg, Args)
      }
      InHook = true

      const Stringified = String(ThisArg)
      if (Stringified.length < 50000 &&
        !FalsePositiveSignPatterns.some(Patterns => Patterns.every(Pattern => Pattern.test(Stringified))) &&
        PL2MajorFuncCallPatterns.filter(Patterns => Patterns.filter(Pattern => Pattern.test(Stringified)).length === Patterns.length).length === 1) {
        console.debug(`[${UserscriptName}]: Function.prototype.call called for PowerLink Skeleton:`, ThisArg)
        BrowserWindow.document.dispatchEvent(PL2Event)
        InHook = false
        return OriginalReflectApply(Target, () => {}, [])
      }
      InHook = false
      return OriginalReflectApply(Target, ThisArg, Args)
    }
  })

  let PL2AfterLoadInitTimerPatterns: RegExp[][] = [[
    /\( *\) *=> *{ *var *_0x[0-9a-z]+ *= *a0_0x[0-9a-f]+ *; *this\[ *_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\]\(\); *}/,
    /\( *\) *=> *{ *var *_0x[0-9a-z]+ *= *a0_0x[0-9a-f]+ *; *this\[ *_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\]\(\); *}/
  ], [
    /\( *\) *=> *{ *var _0x[a-z0-9]+ *= *_0x[a-z0-9]+ *; *if *\( *this\[ *_0x[a-z0-9]+ *\( *0x[0-9a-f]+ *\) *\] *\) *return *clearTimeout/,
    /\( *0x[0-9a-f]+ *\) *\] *\) *, *void *\( *this\[ *_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\] *= *void *\([x0-9a-f*+-]+ *\) *\) *; *this\[_0x[a-z0-9]+\( *0x[0-9a-f]+ *\) *\] *\(\) *;/
  ]]

  BrowserWindow.setTimeout = new Proxy(BrowserWindow.setTimeout, {
    apply(Target: typeof setTimeout, ThisArg: undefined, Args: Parameters<typeof setTimeout>) {
      let StringifiedFunc = String(Args[0])
      if (PL2AfterLoadInitTimerPatterns.filter(PowerLinkGenerationSkeletionPositiveRegExp => PowerLinkGenerationSkeletionPositiveRegExp.filter(Index => Index.test(StringifiedFunc)).length >= 1).length === 1) {
        console.debug(`[${UserscriptName}]: setTimeout called for PowerLink Skeleton:`, Args[0])
        return OriginalReflectApply(Target, ThisArg, [() => {}, 0])
      }

      return OriginalReflectApply(Target, ThisArg, Args)
    }
  })

  BrowserWindow.document.addEventListener('PL2PlaceHolder', () => {
    setTimeout(() => {
      let ContainerElements = new Set([...BrowserWindow.document.querySelectorAll('div[class] div[class] div[class] ~ div[class]')])
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement))
      ContainerElements = new Set([...ContainerElements].filter(Container => {
        return Number(getComputedStyle(Container).getPropertyValue('padding-top').replaceAll(/px$/g, '')) > 10 ||
          Number(getComputedStyle(Container).getPropertyValue('margin-top').replaceAll(/px$/g, '')) > 10
      }))
      ContainerElements = new Set([...ContainerElements, ...[...ContainerElements].flatMap(Container => [...Container.querySelectorAll('*')])])
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement && Container.innerText.trim().length === 0))
      ContainerElements = new Set([...ContainerElements].filter(Container => Number(getComputedStyle(Container).getPropertyValue('border-bottom-width').replaceAll(/px/g, '')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => Number(getComputedStyle(Container).getPropertyValue('border-left-width').replaceAll(/px/g, '')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => Number(getComputedStyle(Container).getPropertyValue('border-right-width').replaceAll(/px/g, '')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => Number(getComputedStyle(Container).getPropertyValue('border-top-width').replaceAll(/px/g, '')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => [...Container.querySelectorAll('*')].some(Child => {
        if (!(Child instanceof HTMLElement)) return false
        let PL2TitleHeight = Child.getClientRects()[0]?.height ?? 0
        let PL2TitleMarginBottom = Number(getComputedStyle(Child).getPropertyValue('margin-bottom').replaceAll(/px/g, ''))
        if (PL2TitleHeight === 0) return false
        return PL2TitleMarginBottom >= PL2TitleHeight * 0.75 && PL2TitleMarginBottom <= PL2TitleHeight * 1.25
      })))
      console.debug(`[${UserscriptName}]: Removing PowerLink Skeleton Containers:`, ContainerElements)
      for (let I = 0; I < ContainerElements.size * 5; I++) {
        ContainerElements.forEach(Container => {
          Container.setAttribute('style', 'display: none !important;')
        })
      }
    }, 2500)

    setTimeout(() => {
      let ContainerElements = new Set([...BrowserWindow.document.querySelectorAll('div[class] div[class] div[class] ~ div[class]')])
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement))
      ContainerElements = new Set([...ContainerElements].filter(Container =>
        Number(getComputedStyle(Container).getPropertyValue('margin-bottom').replaceAll(/px$/g, '')) > 15 ||
        Number(getComputedStyle(Container).getPropertyValue('padding-top').replaceAll(/px$/g, '')) > 20
      ))
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement && Container.innerText.trim().length === 0))
      ContainerElements = new Set([...ContainerElements].filter(Container => [...Container.querySelectorAll('*')].some(Child => Child instanceof HTMLElement &&
        (Number(getComputedStyle(Child).getPropertyValue('padding-top').replaceAll(/px/g, '')) >= 5 &&
        Number(getComputedStyle(Child).getPropertyValue('padding-bottom').replaceAll(/px/g, '')) >= 5 &&
        Number(getComputedStyle(Child).getPropertyValue('padding-left').replaceAll(/px/g, '')) >= 5 &&
        Number(getComputedStyle(Child).getPropertyValue('padding-right').replaceAll(/px/g, '')) >= 5)
      )))
      console.debug(`[${UserscriptName}]: Removing PowerLink Skeleton Containers:`, ContainerElements)
      for (let I = 0; I < ContainerElements.size * 5; I++) {
        ContainerElements.forEach(Container => {
          Container.setAttribute('style', 'display: none !important;')
        })
      }
    }, 2500)
  })
}

RunNamuLinkUserscript(Win)