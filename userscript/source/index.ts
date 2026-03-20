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
  const OriginalObjectDefineProperty = BrowserWindow.Object.defineProperty
  const OriginalProxy = BrowserWindow.Proxy

  const PL2MajorFuncCallPatterns: RegExp[][] = [[
    /function *\( *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *\) *{ *return *[A-Za-z.-9]+/,
    /, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *\) *{ *return *[A-Za-z.-9]+ *\( *[0-9a-fx *+-]+ *, *[A-Za-z.-9]+ *, *[A-Za-z.-9]+ *, *[0-9a-fx *+-]+/,
    /return *[A-Za-z.-9]+ *\( *[0-9a-fx *+-]+ *, *[A-Za-z.-9]+ *, *[A-Za-z.-9]+ *, *[0-9a-fx *+-]+ *,[A-Za-z.-9]+ *, *[A-Za-z.-9]+ * *\) *; *}/
  ], [
    /function *[A-Za-z0-9]+ *\( *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *\) *{ *return *[A-Za-z.-9]+/,
    /, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *\) *{ *return *[A-Za-z.-9]+ *\( *[0-9a-fx *+-]+ *, *[A-Za-z.-9]+ *, *[A-Za-z.-9]+ *, *[0-9a-fx *+-]+/,
    /return *[A-Za-z.-9]+ *\( *[0-9a-fx *+-]+ *, *[A-Za-z.-9]+ *, *[A-Za-z.-9]+ *, *[0-9a-fx *+-]+ *,[A-Za-z.-9]+ *, *[A-Za-z.-9]+ * *\) *; *}/
  ]]

  function PowerLinkElementFromArg(Arg: unknown): HTMLElement | null {
    if (typeof Arg !== 'object' || Arg === null) return null

    const Visited = new Set<object>()
    let Current = (Arg as Record<string, unknown>)['_']

    while (typeof Current === 'object' && Current !== null) {
      if (Visited.has(Current)) break
      Visited.add(Current)

      const VNode = (Current as Record<string, unknown>)['vnode']
      if (typeof VNode === 'object' && VNode !== null) {
        const Element = (VNode as Record<string, unknown>)['el']
        if (Element instanceof HTMLElement) return Element
      }

      Current = (Current as Record<string, unknown>)['parent']
    }

    return null
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  function PowerLinkRenderFromArg(Arg: unknown): Function | null {
    if (typeof Arg !== 'object' || Arg === null) return null

    const Visited = new Set<object>()
    let Current: unknown = (Arg as Record<string, unknown>)['_']

    while (typeof Current === 'object' && Current !== null) {
      if (Visited.has(Current)) break
      Visited.add(Current)

      const Render = (Current as Record<string, unknown>)['render']
      if (typeof Render === 'function') return Render

      Current = (Current as Record<string, unknown>)['parent']
    }

    return null
  }
  function PowerLinkElementFromArgParent(Arg: unknown): HTMLElement | null {
    if (typeof Arg !== 'object' || Arg === null) return null

    const Visited = new Set<object>()
    let Current = (Arg as Record<string, unknown>)['_']

    while (typeof Current === 'object' && Current !== null) {
      if (Visited.has(Current)) break
      Visited.add(Current)

      const Parent = (Current as Record<string, unknown>)['parent']
      if (typeof Parent === 'object' && Parent !== null) {
        const ParentVNode = (Parent as Record<string, unknown>)['vnode']
        if (typeof ParentVNode === 'object' && ParentVNode !== null) {
          const ParentElement = (ParentVNode as Record<string, unknown>)['el']
          if (ParentElement instanceof HTMLElement) return ParentElement
        }
      }

      const VNode = (Current as Record<string, unknown>)['vnode']
      if (typeof VNode === 'object' && VNode !== null) {
        const Element = (VNode as Record<string, unknown>)['el']
        if (Element instanceof HTMLElement) return Element
      }
      Current = Parent
    }
    return null
  }

  const MinRatio = 0.35
  const MaxRatio = 0.75
  const EpsilonRatio = 0.04

  function ParseCssFloat(Value: string): number {
    return Number.parseFloat(Value) || 0
  }

  let CommentContainer: Element = null
  let InHook = false
  BrowserWindow.Function.prototype.call = new Proxy(OriginalFunctionPrototypeCall, {
    apply(Target: typeof Function.prototype.call, ThisArg: unknown, Args: unknown[]) {
      // Prevent infinite recursion when the hook itself calls Function.prototype.call
      if (InHook) {
        return OriginalReflectApply(Target, ThisArg, Args)
      }
      InHook = true

      const Stringified = String(ThisArg)
      if (Stringified.length < 500 && PL2MajorFuncCallPatterns.filter(Patterns => Patterns.filter(Pattern => Pattern.test(Stringified)).length === Patterns.length).length === 1) {
        let PL2Element: HTMLElement | null = PowerLinkElementFromArgParent(Args[6])
        if (PL2Element !== null && [...PL2Element.querySelectorAll('*')].filter(Child => {
          if (!(Child instanceof HTMLElement)) return false
          let PL2TitleHeight = Child.getClientRects()[0]?.height ?? 0
          let PL2TitleMarginBottom = Math.max(ParseCssFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')),
            ParseCssFloat(getComputedStyle(Child).getPropertyValue('margin-bottom')))
          return PL2TitleHeight > 0 && PL2TitleMarginBottom >= PL2TitleHeight * (MinRatio - EpsilonRatio) && PL2TitleMarginBottom <= PL2TitleHeight * (MaxRatio + EpsilonRatio)
        }).length >= 1) {
          console.debug(`[${UserscriptName}]: Function.prototype.call called for PowerLink Skeleton:`, ThisArg)
          CommentContainer = PL2Element
          BrowserWindow.document.dispatchEvent(new CustomEvent('PL2PlaceHolder'))
          BrowserWindow.document.dispatchEvent(new CustomEvent('PL2PlaceHolderMobile'))
          InHook = false
          return OriginalReflectApply(Target, () => {}, [])
        }
        console.debug(`[${UserscriptName}]: Matched Function.prototype.call called, but not for PowerLink Skeleton:`, ThisArg)
      }
      InHook = false
      return OriginalReflectApply(Target, ThisArg, Args)
    }
  })

  BrowserWindow.Object.defineProperty = new Proxy(OriginalObjectDefineProperty, {
    apply(Target: typeof Object.defineProperty, ThisArg: undefined, Args: Parameters<typeof Object.defineProperty>) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      let VuejsRender: Function | null = PowerLinkRenderFromArg(Args[0])
      let PL2Element: HTMLElement | null = PowerLinkElementFromArgParent(Args[0])
      let Stringified = String(VuejsRender ?? '')
      if (VuejsRender !== null && PL2Element !== null && Stringified.length < 500 &&
        PL2MajorFuncCallPatterns.filter(Patterns => Patterns.filter(Pattern => Pattern.test(Stringified)).length === Patterns.length).length === 1 &&
        [...PL2Element.querySelectorAll('*')].filter(Child => {
          if (!(Child instanceof HTMLElement)) return false
          let PL2TitleHeight = Child.getClientRects()[0]?.height ?? 0
          let PL2TitleMarginBottom = Math.max(ParseCssFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')),
            ParseCssFloat(getComputedStyle(Child).getPropertyValue('margin-bottom')))
          return PL2TitleHeight > 0 && PL2TitleMarginBottom >= PL2TitleHeight * (MinRatio - EpsilonRatio) && PL2TitleMarginBottom <= PL2TitleHeight * (MaxRatio + EpsilonRatio)
        }).length >= 1
      ) {
        console.debug(`[${UserscriptName}]: Restoring renderer.call for detected PowerLink skeleton:`, Args[0])
        VuejsRender.call = Function.prototype.call
        return
      }
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  function PowerLinkOverrideRenderFromArg(Arg: unknown, Override: Function): number {
    if (typeof Arg !== 'object' || Arg === null) return 1

    const Visited = new Set<object>()
    let Current: unknown = (Arg as Record<string, unknown>)['_']

    while (typeof Current === 'object' && Current !== null) {
      if (Visited.has(Current)) return 2
      Visited.add(Current)

      const RecordCurrent = Current as Record<string, unknown>
      const Render = RecordCurrent['render']

      if (typeof Render === 'function') {
        RecordCurrent['render'] = Override
        return 0
      }

      Current = RecordCurrent['parent']
    }

    return 3
  }

  BrowserWindow.Proxy = new Proxy(OriginalProxy, {
    construct(Target: typeof Proxy, Args: ConstructorParameters<typeof Proxy>) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      let VuejsRender: Function | null = PowerLinkRenderFromArg(Args[0])
      let PL2Element: HTMLElement | null = PowerLinkElementFromArgParent(Args[0])
      let Stringified = String(VuejsRender ?? '')
      if (VuejsRender !== null && PL2Element !== null && Stringified.length < 500 &&
        PL2MajorFuncCallPatterns.filter(Patterns => Patterns.filter(Pattern => Pattern.test(Stringified)).length === Patterns.length).length === 1 &&
        [...PL2Element.querySelectorAll('*')].filter(Child => {
          if (!(Child instanceof HTMLElement)) return false
          let PL2TitleHeight = Child.getClientRects()[0]?.height ?? 0
          let PL2TitleMarginBottom = Math.max(ParseCssFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')),
            ParseCssFloat(getComputedStyle(Child).getPropertyValue('margin-bottom')))
          return PL2TitleHeight > 0 && PL2TitleMarginBottom >= PL2TitleHeight * (MinRatio - EpsilonRatio) && PL2TitleMarginBottom <= PL2TitleHeight * (MaxRatio + EpsilonRatio)
        }).length >= 1
      ) {
        console.debug(`[${UserscriptName}]: Prevented declaring render function in Vue.js 3 for detected PowerLink skeleton:`, Args[0], PL2Element)
        PowerLinkOverrideRenderFromArg(Args[0], () => null)
        BrowserWindow.document.dispatchEvent(new CustomEvent('PL2PlaceHolderProxy'))
      }
      return Reflect.construct(Target, Args)
    }
  })

  BrowserWindow.document.addEventListener('PL2AdvertContainer', () => {
    setTimeout(() => {
      let ContainerElements = new Set([CommentContainer])
      ContainerElements = new Set([...ContainerElements, ...[...ContainerElements].flatMap(Container => [...Container.querySelectorAll('*')])])
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-bottom-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-left-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-right-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-top-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => [...Container.querySelectorAll('*')].some(Child => {
        if (!(Child instanceof HTMLElement)) return false
        let PL2TitleHeight = Child.getClientRects()[0]?.height ?? 0
        let PL2TitleMarginBottom = ParseCssFloat(getComputedStyle(Child).getPropertyValue('margin-bottom'))
        if (PL2TitleHeight === 0) return false
        return PL2TitleMarginBottom >= PL2TitleHeight * 0.65 && PL2TitleMarginBottom <= PL2TitleHeight * 1.25
      })))
      console.debug(`[${UserscriptName}]: Removing PowerLink Skeleton Containers (PL2AdvertContainer):`, ContainerElements)
      ContainerElements.forEach(Container => {
        Container.setAttribute('style', 'display: none !important;')
      })
    }, 2500)
  })
  
  BrowserWindow.document.addEventListener('PL2PlaceHolderMobile', () => {
    setTimeout(() => {
      let ContainerElements = new Set([...BrowserWindow.document.querySelectorAll('div[class] div[class] div[class] ~ div[class]')])
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement))
      ContainerElements = new Set([...ContainerElements].filter(Container =>
        ParseCssFloat(getComputedStyle(Container).getPropertyValue('margin-bottom')) > 15 ||
        ParseCssFloat(getComputedStyle(Container).getPropertyValue('padding-top')) > 20
      ))
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement && Container.innerText.trim().length === 0))
      ContainerElements = new Set([...ContainerElements].filter(Container => [...Container.querySelectorAll('*')].some(Child => Child instanceof HTMLElement &&
        (ParseCssFloat(getComputedStyle(Child).getPropertyValue('padding-top')) >= 5 &&
        ParseCssFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')) >= 5 &&
        ParseCssFloat(getComputedStyle(Child).getPropertyValue('padding-left')) >= 5 &&
        ParseCssFloat(getComputedStyle(Child).getPropertyValue('padding-right')) >= 5)
      )))
      console.debug(`[${UserscriptName}]: Removing PowerLink Skeleton Containers (PL2PlaceHolderMobile):`, ContainerElements)
      ContainerElements.forEach(Container => {
        Container.setAttribute('style', 'display: none !important;')
      })
    }, 2500)
  })

  BrowserWindow.document.addEventListener('PL2PlaceHolder', () => {
    setTimeout(() => {
      let ContainerElements = new Set([...BrowserWindow.document.querySelectorAll('div[class] div[class] div[class] ~ div[class]')])
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement))
      ContainerElements = new Set([...ContainerElements].filter(Container => {
        return ParseCssFloat(getComputedStyle(Container).getPropertyValue('padding-top')) > 10 ||
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('margin-top')) > 10
      }))
      ContainerElements = new Set([...ContainerElements, ...[...ContainerElements].flatMap(Container => [...Container.querySelectorAll('*:not(button)')])])
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement && Container.innerText.trim().length === 0))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-bottom-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-left-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-right-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-top-width')) >= 0.5))
      ContainerElements = new Set([...ContainerElements].filter(Container => ParseCssFloat(getComputedStyle(Container).getPropertyValue('transition-duration')) >= 0.01))
      console.debug(`[${UserscriptName}]: Removing PowerLink Skeleton Containers (PL2PlaceHolder):`, ContainerElements)
      ContainerElements.forEach(Container => {
        Container.setAttribute('style', 'display: none !important;')
      })
    }, 2500)
  })

  BrowserWindow.document.addEventListener('PL2PlaceHolderProxy', () => {
    setTimeout(() => {
      let ContainerElements = new Set([...BrowserWindow.document.querySelectorAll('div[class] div[class] div[class] ~ div[class]')])
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement))
      ContainerElements = new Set([...ContainerElements].filter(Container => {
        return ParseCssFloat(getComputedStyle(Container).getPropertyValue('padding-top')) >= 5 &&
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('padding-bottom')) >= 5 &&
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('padding-left')) >= 5 &&
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('padding-right')) >= 5 &&
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-top-width')) >= 0.35 &&
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-bottom-width')) >= 0.35 &&
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-left-width')) >= 0.35 &&
          ParseCssFloat(getComputedStyle(Container).getPropertyValue('border-right-width')) >= 0.35 &&
          Container.getClientRects()[0]?.height <= 20 && Container.getClientRects()[0]?.height > 0
      }))
      ContainerElements = new Set([...ContainerElements].filter(Container => Container instanceof HTMLElement && Container.innerText.trim().length === 0))
      console.debug(`[${UserscriptName}]: Removing PowerLink Skeleton Containers (PL2PlaceHolderProxy):`, ContainerElements)
      ContainerElements.forEach(Container => {
        Container.setAttribute('style', 'display: none !important;')
      })
    }, 2500)
  })
}

RunNamuLinkUserscript(Win)