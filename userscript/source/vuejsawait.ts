export function AttachVueSettledEvents(TargetEl: HTMLElement, Options: { QuietMs?: number; EventName?: string; ChangeEventName?: string; UrlChange?: string; BlackBlank?: string } = {}) {
  const QuietMs = Options.QuietMs ?? 120
  const EventName = Options.EventName ?? 'vue:settled'
  const ChangeEventName = Options.ChangeEventName ?? 'vue:dom-changed'
  const UrlChangeEventName = Options.UrlChange ?? 'vue:url-changed'
  const UrlBlackBlankEventName = Options.BlackBlank ?? 'vue:black-blank'

  if (!(TargetEl instanceof HTMLElement)) {
    throw new TypeError('TargetEl must be an HTMLElement')
  }

  let Timer: number = -1
  let Seq = 0
  let Destroyed = false
  let LastMutationAt = performance.now()
  let URLHistory: URL = new URL(location.href)

  let BlackBlankRemovedCounter: boolean = false

  const EmitChange = (Mutations: MutationRecord[]) => {
    TargetEl.dispatchEvent(
      new CustomEvent(ChangeEventName, {
        detail: {
          Seq,
          At: LastMutationAt,
          MutationCount: Mutations.length,
          Mutations,
        },
      }),
    )
  }

  const EmitSettled = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (Destroyed) {
          return
        }

        TargetEl.dispatchEvent(
          new CustomEvent(EventName, {
            detail: {
              Seq,
              QuietMs,
              SettledAt: performance.now(),
              ElapsedSinceLastMutation: performance.now() - LastMutationAt,
              Target: TargetEl,
            },
          }),
        )
      })
    })
  }

  const EmitUrlChange = () => {
    const NewURL = new URL(location.href)
    if (NewURL.href !== URLHistory.href) {
      URLHistory = NewURL
      TargetEl.dispatchEvent(
        new CustomEvent(UrlChangeEventName, {
          detail: {
            Seq,
            At: performance.now(),
            URL: NewURL,
          },
        }),
      )
    }
  }

  const EmitBlackBlank = () => {
    TargetEl.dispatchEvent(
      new CustomEvent(UrlBlackBlankEventName, {
        detail: {
          Seq,
          QuietMs,
          SettledAt: performance.now(),
          ElapsedSinceLastMutation: performance.now() - LastMutationAt,
          Target: TargetEl,
        }
      })
    )
  }

  const ArmSettledTimer = () => {
    clearTimeout(Timer)
    Timer = setTimeout(EmitSettled, QuietMs)
  }

  const Observer = new MutationObserver((Mutations: MutationRecord[]) => {
    Seq += 1
    LastMutationAt = performance.now()

    EmitChange(Mutations)

    const AllNodes = Mutations.flatMap(Mutation => [
      ...Mutation.addedNodes, ...Mutation.removedNodes,
      ...Mutation.nextSibling ? [Mutation.nextSibling] : [],
      ...Mutation.previousSibling ? [Mutation.previousSibling] : [],
      ...(Mutation.target ? [Mutation.target] : [])
    ])
    
    if (AllNodes.length >= 15) {
      ArmSettledTimer()
      setTimeout(ArmSettledTimer, QuietMs * 3)
    }
    if (AllNodes.some(MNode => MNode instanceof HTMLElement && parseFloat(getComputedStyle(MNode).getPropertyValue('margin-bottom')) > 10 && MNode.innerText.trim().length === 0)) {
      RepeatWithInterval(5, QuietMs * 2, EmitBlackBlank)
    }
    EmitUrlChange()
  })

  Observer.observe(TargetEl, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })

  ArmSettledTimer()

  return {
    Disconnect() {
      Destroyed = true
      clearTimeout(Timer)
      Observer.disconnect()

      TargetEl.dispatchEvent(
        new CustomEvent('vue:observer-disconnected', {
          detail: { Target: TargetEl },
        }),
      )
    },
  }
}

function RepeatWithInterval(RepeatCount: number, DelayMs: number, Func: () => void) {
  let Count = 0
  const Id = setInterval(() => {
    Count++
    Func()
    if (Count >= RepeatCount) clearInterval(Id)
  }, DelayMs)
}