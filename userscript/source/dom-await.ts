export function WaitForElement(Selector: string, Root: HTMLElement | Document = document.documentElement): Promise<HTMLElement> {
  return new Promise((Resolve) => {
    const Found = Root.querySelector(Selector)

    if (Found && Found instanceof HTMLElement) {
      Resolve(Found)
      return
    }

    const Observer = new MutationObserver(() => {
      const El = Root.querySelector(Selector)

      if (El && El instanceof HTMLElement) {
        Observer.disconnect()
        Resolve(El)
      }
    })

    Observer.observe(Root, {
      subtree: true,
      childList: true,
      attributes: true
    })
  })
}