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

import { AttachVueSettledEvents } from './vuejsawait.js'
import { WaitForElement } from './dom-await.js'
import { CreateOcrWorkerClient } from './ocr-client.js'

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __OCR_WORKER_CODE__: string

export async function RunNamuLinkUserscript(BrowserWindow: typeof window, UserscriptName: string = 'NamuLink'): Promise<void> {
  const OriginalReflectApply = BrowserWindow.Reflect.apply

  const PL2PromiseThenRegexs: RegExp[][] = [[
    /function *[A-Za-z0-9]+ *\([A-Za-z0-9]+ * *\) *{ *function *[A-Za-z0-9]+ *\( *[a-zA-Z]+ *, *[A-Za-z]+ *\) *{ *return *[A-Za-z0-9]+ *\( */,
    /{ *return *[A-Za-z0-9]+ *\( *[a-zA-Z]+ *- *0x[a-f0-9]+ *, *[a-zA-Z]+ *\) *; *\} *[A-Za-z0-9]+ *\( *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+/,
    /\( *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *, *[A-Za-z0-9]+ *\( *0x[a-f0-9]+ *, *0x[a-f0-9]+ *\) *, *[A-Za-z0-9]+ *\) *;/
  ]]

  BrowserWindow.Promise.prototype.then = new Proxy(BrowserWindow.Promise.prototype.then, {
    apply(Target: typeof Promise.prototype.then, ThisArg: Promise<unknown>, Args: Parameters<typeof Promise.prototype.then>) {
      if (typeof Args[0] !== 'function' || typeof Args[1] !== 'function') {
        return OriginalReflectApply(Target, ThisArg, Args)
      }
      const Stringified: [string, string] = [String(Args[0]), String(Args[1])]
      if (Stringified.every(Str => PL2PromiseThenRegexs.filter(Regexs => Regexs.filter(Regex => Regex.test(Str)).length === Regexs.length).length === 1)) {
        console.debug(`[${UserscriptName}] Detected PL2 Promise.then`, Stringified, Args)
        setTimeout(() => {
          let Targeted = [...document.querySelectorAll('#app div[class] div[class] ~ div[class]')].filter(Ele => Ele instanceof HTMLElement)
          Targeted = Targeted.filter(Ele => parseFloat(getComputedStyle(Ele).getPropertyValue('margin-bottom')) >= 12.5)
          Targeted = Targeted.filter(Ele => Ele.innerText.trim().length === 0)
          Targeted = Targeted.filter(Ele => [...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement).some(Child => {
            const Height = Child.getBoundingClientRect().height
            return Height > 0 && Height <= 5
          }))
          console.debug(`[${UserscriptName}] Detected PL2 Promise.then Targeted`, Targeted)
          Targeted.forEach(Ele => {
            Ele.style.setProperty('display', 'none', 'important')
          })
        }, 250)
        return
      }
      return OriginalReflectApply(Target, ThisArg, Args)
    }
  })

  const ArticleHTMLElement = await WaitForElement('#app', BrowserWindow.document)
  const EventName = 'vue:settled'
  const ChangeEventName = 'vue:change'
  const UrlChangeEventName = 'vue:url-changed'
  AttachVueSettledEvents(ArticleHTMLElement, {
    QuietMs: 75,
    EventName: EventName,
    ChangeEventName: ChangeEventName,
    UrlChange: UrlChangeEventName
  })

  const OCRInstance = CreateOcrWorkerClient(BrowserWindow, new Worker(URL.createObjectURL(new Blob([__OCR_WORKER_CODE__], { type: 'application/javascript' }))))

  async function ExecuteOCR(Targeted: HTMLElement[]) {
    const NextTargeted = []
      for (const Parent of Targeted) {
        const CandidateChildren = [...Parent.querySelectorAll('*')]
          .filter(Child => Child instanceof HTMLElement)
          .filter(Child =>
            Child instanceof HTMLImageElement ||
            getComputedStyle(Child).backgroundImage !== 'none'
          ).filter(Child => parseFloat(getComputedStyle(Child).getPropertyValue('width')) >= 5 && parseFloat(getComputedStyle(Child).getPropertyValue('height')) >= 5)
          .filter(Child => parseFloat(getComputedStyle(Child).getPropertyValue('width')) <= 50 && parseFloat(getComputedStyle(Child).getPropertyValue('height')) <= 50)
        let MatchedCount = 0
        for (const Child of CandidateChildren) {
          const Result = await OCRInstance.DetectFromElement(Child, {
            ScoreThreshold: 0.32
          })
          if (Result !== null) {
            MatchedCount += 1
          }
          if (MatchedCount >= 1) {
            NextTargeted.push(Parent)
            break
          }
        }
      }
      return NextTargeted
  }

  function AllParents(Ele: HTMLElement): Set<HTMLElement> {
    let SetHTMLElement = new Set([Ele])
    for (let I = 0;; I++) {
      let Upper = [...SetHTMLElement][I].parentElement
      if (Upper === null) {
        break
      }
      SetHTMLElement.add(Upper)
    }
    return SetHTMLElement
  }

  async function Handler(EventParameter: Event) {
    let Targeted = [...document.querySelectorAll('#app div[class] div[class] ~ div[class]')].filter(Ele => Ele instanceof HTMLElement)
    Targeted = Targeted.filter(Ele =>
      parseFloat(getComputedStyle(Ele).getPropertyValue('padding-top')) >= 20 ||
      parseFloat(getComputedStyle(Ele).getPropertyValue('margin-top')) >= 20 ||
      parseFloat(getComputedStyle(Ele).getPropertyValue('margin-bottom')) >= 12.5
    )
    Targeted = Targeted.filter(Ele => {
      let Children = [...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement)
      // non-HTMLTableElement
      if (Children.filter(Child => 
        parseFloat(getComputedStyle(Child).getPropertyValue('padding-top')) >= 5 &&
        parseFloat(getComputedStyle(Child).getPropertyValue('border-bottom-width')) >= 0.1
      ).length === 1) return true
      // HTMLTableElement
      return Children.filter(Child => (Child instanceof HTMLTableElement || Child instanceof HTMLTableCellElement) &&
        parseFloat(getComputedStyle(Child).getPropertyValue('padding-top')) >= 5 && parseFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')) >= 5).length >= 2
    })
    Targeted = Targeted.filter(Ele => {
      let Children = [...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement)
      return !Children.some(Child => {
        return parseFloat(getComputedStyle(Child).getPropertyValue('margin-bottom')) >= 10 && parseFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')) >= 1 && parseFloat(getComputedStyle(Child).getPropertyValue('padding-top')) >= 1 &&
        parseFloat(getComputedStyle(Child).getPropertyValue('border-top-width')) >= 0.25 && parseFloat(getComputedStyle(Child).getPropertyValue('border-bottom-width')) >= 0.25
      })
    })
    Targeted = Targeted.filter(Ele => {
      let Children = [...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement)
      Children = Children.filter(Child => parseFloat(getComputedStyle(Child).getPropertyValue('padding-right')) >= 10 && parseFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')) >= 10)
      Children = Children.filter(Child => parseFloat(getComputedStyle(Child).getPropertyValue('margin-left')) >= 2.5)
      return Children.length === 0
    })
    Targeted = Targeted.filter(Ele => {
      if (Ele.getBoundingClientRect().width < 500 && BrowserWindow.document.body.getBoundingClientRect().width > 500) return false
      let Children = [...Ele.querySelectorAll('*[style]')].filter(Child => Child instanceof HTMLElement && Child.style.length > 0)
      return Children.filter(Child => {
        if (!(Child instanceof HTMLElement)) return false
        const ComputedStyle = getComputedStyle(Child)
        const MissingCount = [...Child.style].filter(Property => {
          const InlineValue = Child.style.getPropertyValue(Property).trim()
          const ComputedValue = ComputedStyle.getPropertyValue(Property).trim()
          return InlineValue !== ComputedValue
        }).length
        return MissingCount <= 1
      }).length < 5
    })
    Targeted = await ExecuteOCR(Targeted)
    Targeted.forEach(Ele => Targeted.push(...new Set([...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement))))
    Targeted = [...new Set(Targeted)]
    let RealTargeted = Targeted.filter(Ele => parseFloat(getComputedStyle(Ele).getPropertyValue('padding-left')) >= 5 && parseFloat(getComputedStyle(Ele).getPropertyValue('border-right-width')) >= 0.1)
    console.debug(`[${UserscriptName}] ${EventParameter.type} RealTargeted`, RealTargeted, EventParameter)
    RealTargeted.forEach(Ele => {
      Ele.style.setProperty('display', 'none', 'important')
    })
    let RealTabletTargeted = Targeted.filter(Ele => {
      if (!(Ele instanceof HTMLElement) || !(Ele instanceof HTMLTableElement)) return false
      let Children = [...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement)
      return Children.some(Child => parseFloat(getComputedStyle(Child).getPropertyValue('padding-top')) >= 5 && parseFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')) >= 5)
    })
    console.debug(`[${UserscriptName}] ${EventParameter.type} RealTabletTargeted`, RealTabletTargeted, EventParameter)
    RealTabletTargeted.forEach(Ele => {
      Ele.style.setProperty('display', 'none', 'important')
    })

    // leftover
    const PlaceHolderCandidated: Set<HTMLElement> = new Set([...RealTargeted, ...RealTabletTargeted])
    PlaceHolderCandidated.forEach(PlaceHolder => {
      let Parents = [...AllParents(PlaceHolder)].filter(Ele => Ele.innerText.trim().length === 0)
      Parents.forEach(Ele => PlaceHolderCandidated.add(Ele))
    })
    console.debug(`[${UserscriptName}] ${EventParameter.type} PlaceHolderCandidated`, PlaceHolderCandidated, EventParameter);
    [...PlaceHolderCandidated].forEach(Ele => {
      Ele.style.setProperty('display', 'none', 'important')
    })
  }

  ArticleHTMLElement.addEventListener('vue:settled', (EventParameter) => Handler(EventParameter))
  ArticleHTMLElement.addEventListener('vue:url-changed', (EventParameter) => setTimeout(() => Handler(EventParameter), 250))

  // init Naver Nanum fonts
  const FontAddr = [
    'https://fonts.googleapis.com/css2?family=Nanum Gothic&display=swap',
  ]
  FontAddr.forEach(Addr => {
    const Link = BrowserWindow.document.createElement('link')
    Link.rel = 'stylesheet'
    Link.href = Addr
    BrowserWindow.document.head.appendChild(Link)
  })
}

void RunNamuLinkUserscript(Win)