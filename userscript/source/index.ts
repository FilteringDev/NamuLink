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

  const ArticleHTMLElement = await WaitForElement('#app', BrowserWindow.document)
  AttachVueSettledEvents(ArticleHTMLElement, {
    QuietMs: 250,
    EventName: 'vue:settled',
    ChangeEventName: 'vue:change'
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

  ArticleHTMLElement.addEventListener('vue:settled', async () => {
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
      let Rect = Ele.getBoundingClientRect()
      return Rect.width / Rect.height <= 1
    })
    Targeted = await ExecuteOCR(Targeted)
    Targeted.forEach(Ele => Targeted.push(...new Set([...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement))))
    Targeted = [...new Set(Targeted)]
    let RealTargeted = Targeted.filter(Ele => parseFloat(getComputedStyle(Ele).getPropertyValue('padding-left')) >= 5 && parseFloat(getComputedStyle(Ele).getPropertyValue('border-right-width')) >= 0.1)
    console.debug(`[${UserscriptName}] vue:settled RealTargeted`, RealTargeted)
    RealTargeted.forEach(Ele => {
      Ele.style.setProperty('display', 'none', 'important')
    })
    let RealTabletTargeted = Targeted.filter(Ele => {
      if (!(Ele instanceof HTMLElement) || !(Ele instanceof HTMLTableElement)) return false
      let Children = [...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement)
      return Children.some(Child => parseFloat(getComputedStyle(Child).getPropertyValue('padding-top')) >= 5 && parseFloat(getComputedStyle(Child).getPropertyValue('padding-bottom')) >= 5)
    })
    console.debug(`[${UserscriptName}] vue:settled RealTabletTargeted`, RealTabletTargeted)
    RealTabletTargeted.forEach(Ele => {
      Ele.style.setProperty('display', 'none', 'important')
    })

    // leftover
    const PlaceHolderCandidated: Set<HTMLElement> = new Set([...RealTargeted, ...RealTabletTargeted])
    PlaceHolderCandidated.forEach(PlaceHolder => {
      let Parents = [...AllParents(PlaceHolder)].filter(Ele => Ele.innerText.trim().length === 0)
      Parents.forEach(Ele => PlaceHolderCandidated.add(Ele))
    })
    console.debug(`[${UserscriptName}] vue:settled PlaceHolderCandidated`, PlaceHolderCandidated);
    [...PlaceHolderCandidated].forEach(Ele => {
      Ele.style.setProperty('display', 'none', 'important')
    })
  })

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