/*!
 * @license MPL-2.0
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Contributors:
 *   - See Git history at https://github.com/FilteringDev/tinyShield for detailed authorship information.
 */

type SpaNavigateCause =
  | 'init'
  | 'pushState'
  | 'replaceState'
  | 'popstate'
  | 'hashchange'

export type SpaNavigateDetail = {
  Seq: number
  From: string | null
  To: string
  Cause: SpaNavigateCause
}

export type SpaRenderedDetail = {
  Seq: number
  Url: string
  Ok: boolean
}

export type IgnoreMutation = (Mutation: MutationRecord) => boolean

export type SpaBridgeOptions = {
  Root?: () => Node | null
  StableForMs?: number
  SampleWindowMs?: number
  Threshold?: number
  TimeoutMs?: number
  IgnoreMutation?: IgnoreMutation
  WatchHashChange?: boolean
  Events?: {
    Navigate?: 'SpaNavigate'
    Rendered?: 'SpaRendered'
  }
}

type WaitStableOptions = {
  Root: Node
  StableForMs: number
  SampleWindowMs: number
  Threshold: number
  TimeoutMs: number
  Ignore?: IgnoreMutation
}

/**
 * SPA 라우팅(URL 변경)을 감지해 커스텀 이벤트를 발행하고,
 * DOM이 충분히 안정화되면 'Rendered' 이벤트까지 발행하는 브릿지
 *
 * Events (PascalCase):
 * - 'SpaNavigate'  => CustomEvent<SpaNavigateDetail>
 * - 'SpaRendered'  => CustomEvent<SpaRenderedDetail>
 */
export function InstallSpaNavigationBridge(Options: SpaBridgeOptions = {}): () => void {

  const Opts = NormalizeOptions(Options)

  const EventNavigate = Opts.Events.Navigate
  const EventRendered = Opts.Events.Rendered

  const FireNavigate = (Detail: SpaNavigateDetail) => {
    window.dispatchEvent(new CustomEvent<SpaNavigateDetail>(EventNavigate, { detail: Detail }))
  }

  const FireRendered = (Detail: SpaRenderedDetail) => {
    window.dispatchEvent(new CustomEvent<SpaRenderedDetail>(EventRendered, { detail: Detail }))
  }

  let LastUrl = window.location.href
  let NavSeq = 0
  let Disposed = false

  const OnUrlMaybeChanged = (Cause: SpaNavigateCause) => {
    if (Disposed) return

    const Url = window.location.href
    if (Url === LastUrl) return

    const From = LastUrl
    LastUrl = Url

    const Seq = ++NavSeq
    FireNavigate({ Seq, From, To: Url, Cause })

    void (async () => {
      const Root = Opts.Root()
      if (!Root) {
        if (Seq !== NavSeq || Disposed) return
        FireRendered({ Seq, Url, Ok: true })
        return
      }

      const Ok = await WaitForDomMostlyStable({
        Root: Root,
        StableForMs: Opts.StableForMs,
        SampleWindowMs: Opts.SampleWindowMs,
        Threshold: Opts.Threshold,
        TimeoutMs: Opts.TimeoutMs,
        Ignore: Opts.IgnoreMutation,
      })

      if (Seq !== NavSeq || Disposed) return
      FireRendered({ Seq, Url, Ok })
    })()
  }

  const PatchHistory = (MethodName: 'pushState' | 'replaceState') => {
    const Original = history[MethodName].bind(history)

    const Patched = (...Args: Parameters<History['pushState']>): ReturnType<History['pushState']> => {
      const Ret = Original(...Args)
      queueMicrotask(() => OnUrlMaybeChanged(MethodName))
      return Ret
    }

    Object.defineProperty(history, MethodName, {
      value: Patched,
      configurable: true,
      writable: true,
    })
  }

  PatchHistory('pushState')
  PatchHistory('replaceState')

  const OnPopState = () => OnUrlMaybeChanged('popstate')
  window.addEventListener('popstate', OnPopState)

  const OnHashChange = () => OnUrlMaybeChanged('hashchange')
  if (Opts.WatchHashChange) window.addEventListener('hashchange', OnHashChange)

  queueMicrotask(() => {
    if (Disposed) return

    const Seq = ++NavSeq
    FireNavigate({ Seq, From: null, To: window.location.href, Cause: 'init' })

    void (async () => {
      const Root = Opts.Root()
      if (!Root) {
        if (Seq !== NavSeq || Disposed) return
        FireRendered({ Seq, Url: window.location.href, Ok: true })
        return
      }

      const Ok = await WaitForDomMostlyStable({
        Root: Root,
        StableForMs: Opts.StableForMs,
        SampleWindowMs: Opts.SampleWindowMs,
        Threshold: Opts.Threshold,
        TimeoutMs: Opts.TimeoutMs,
        Ignore: Opts.IgnoreMutation,
      })

      if (Seq !== NavSeq || Disposed) return
      FireRendered({ Seq, Url: window.location.href, Ok: Ok })
    })()
  })

  return () => {
    Disposed = true
    window.removeEventListener('popstate', OnPopState)
    if (Opts.WatchHashChange) window.removeEventListener('hashchange', OnHashChange)
  }
}

export function DefaultIgnoreMutation(Mutation: MutationRecord): boolean {
  if (Mutation.type === 'attributes') {
    const Name = Mutation.attributeName ?? ''
    if (Name === 'class' || Name === 'style') return true
    if (Name.startsWith('aria-') || Name.startsWith('data-')) return true
  }
  return false
}

function NormalizeOptions(Options: SpaBridgeOptions) {
  return {
    Root: Options.Root ?? (() => document.querySelector('#app') ?? document.body),
    StableForMs: Options.StableForMs ?? 900,
    SampleWindowMs: Options.SampleWindowMs ?? 900,
    Threshold: Options.Threshold ?? 3,
    TimeoutMs: Options.TimeoutMs ?? 12000,
    IgnoreMutation: Options.IgnoreMutation ?? DefaultIgnoreMutation,
    WatchHashChange: Options.WatchHashChange ?? true,
    Events: {
      Navigate: Options.Events?.Navigate ?? 'SpaNavigate',
      Rendered: Options.Events?.Rendered ?? 'SpaRendered',
    },
  }
}

async function WaitForDomMostlyStable(Opts: WaitStableOptions): Promise<boolean> {
  const Events: Array<{ T: number; Score: number }> = []
  let LastAboveAt = performance.now()
  let Done = false

  const Observer = new MutationObserver((List) => {
    const Now = performance.now()

    for (const M of List) {
      if (Opts.Ignore?.(M)) continue

      let Score = 1
      if (M.type === 'childList') Score = 2
      Events.push({ T: Now, Score })
    }

    const Cutoff = Now - Opts.SampleWindowMs
    while (Events.length && Events[0].T < Cutoff) Events.shift()

    const WindowScore = Events.reduce((Sum, E) => Sum + E.Score, 0)
    if (WindowScore > Opts.Threshold) LastAboveAt = Now
  })

  Observer.observe(Opts.Root, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })

  const Start = performance.now()

  return await new Promise<boolean>((Resolve) => {
    const Tick = () => {
      if (Done) return

      const Now = performance.now()

      if (Now - LastAboveAt >= Opts.StableForMs) {
        Done = true
        Observer.disconnect()
        Resolve(true)
        return
      }

      if (Now - Start >= Opts.TimeoutMs) {
        Done = true
        Observer.disconnect()
        Resolve(false)
        return
      }

      setTimeout(Tick, 100)
    }

    setTimeout(Tick, 0)
  })
}