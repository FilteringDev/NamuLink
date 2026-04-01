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
  const ArticleHTMLElement = await WaitForElement('#app', BrowserWindow.document)
  AttachVueSettledEvents(ArticleHTMLElement, {
    QuietMs: 250,
    EventName: 'vue:settled',
    ChangeEventName: 'vue:change'
  })

  const OCRInstance = CreateOcrWorkerClient(BrowserWindow, new Worker(URL.createObjectURL(new Blob([__OCR_WORKER_CODE__], { type: 'application/javascript' }))))

  ArticleHTMLElement.addEventListener('vue:settled', async () => {
    let Targeted = [...document.querySelectorAll('#app div[class] div[class] ~ div[class]')].filter(Ele => Ele instanceof HTMLElement)
    Targeted = Targeted.filter(Ele => parseFloat(getComputedStyle(Ele).getPropertyValue('padding-top')) >= 20 || parseFloat(getComputedStyle(Ele).getPropertyValue('margin-top')) >= 20)
    Targeted = Targeted.filter(Ele => [...Ele.querySelectorAll('*')].filter(Child => 
      parseFloat(getComputedStyle(Child).getPropertyValue('padding-top')) >= 5 && parseFloat(getComputedStyle(Child).getPropertyValue('border-bottom-width')) >= 0.1
    ).length === 1)
    Targeted = await (async () => {
      const NextTargeted = []
      for (const Parent of Targeted) {
        const CandidateChildren = [...Parent.querySelectorAll('*')]
          .filter(Child => Child instanceof HTMLElement)
          .filter(Child =>
            Child instanceof HTMLImageElement ||
            getComputedStyle(Child).backgroundImage !== 'none'
          )
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
    })()
    Targeted.forEach(Ele => Targeted.push(...new Set([...Ele.querySelectorAll('*')].filter(Child => Child instanceof HTMLElement))))
    Targeted = [...new Set(Targeted)]
    Targeted = Targeted.filter(Ele => parseFloat(getComputedStyle(Ele).getPropertyValue('padding-left')) >= 5 && parseFloat(getComputedStyle(Ele).getPropertyValue('border-right-width')) >= 0.1)
    console.debug(`[${UserscriptName}] Detected ${Targeted.length} potential ad elements.`, Targeted)
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