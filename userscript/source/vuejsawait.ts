export function AttachVueSettledEvents(TargetEl: HTMLElement, Options: { QuietMs?: number; EventName?: string; ChangeEventName?: string } = {}) {
  const QuietMs = Options.QuietMs ?? 120
  const EventName = Options.EventName ?? 'vue:settled'
  const ChangeEventName = Options.ChangeEventName ?? 'vue:dom-changed'

  if (!(TargetEl instanceof HTMLElement)) {
    throw new TypeError('TargetEl must be an HTMLElement')
  }

  let Timer = null
  let Seq = 0
  let Destroyed = false
  let LastMutationAt = performance.now()

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

  const ArmSettledTimer = () => {
    clearTimeout(Timer)
    Timer = setTimeout(EmitSettled, QuietMs)
  }

  const Observer = new MutationObserver((Mutations: MutationRecord[]) => {
    Seq += 1
    LastMutationAt = performance.now()

    EmitChange(Mutations)
    ArmSettledTimer()
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