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

  const PowerLinkMajorFuncCallPatterns: RegExp[][] = [[
    /function *\( *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *, *_0x[a-f0-9]+ *\) *{ *var *_0x[a-f0-9]+/,
    /('|")td('|") *, *{ *('|")class('|") *: *\( *-? *0x[a-f0-9]+ *\+ *-? *0x[a-f0-9]+ *\+ *0x[a-f0-9]+ *, *_0x[a-f0-9]+ *\[ *_0x[a-f0-9]+ */,
    /\( *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\) *, *('|")onClick('|") *: *_0x[a-f0-9]+ *\[ *-? *0x[a-f0-9]+ *\* *-? *0x[a-f0-9]+/,
    /_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *\) *, *('|")colspan('|") *: *_0x[a-f0-9]+ *\( *0x[a-f0-9]+ *\) *=== *_0x[a-f0-9]+ *\[ *_0x[a-f0-9]+ *\(/
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
        PowerLinkMajorFuncCallPatterns.filter(Patterns => Patterns.filter(Pattern => Pattern.test(Stringified)).length === Patterns.length).length === 1) {
        console.debug(`[${UserscriptName}]: Function.prototype.call called for PowerLink Skeleton:`, ThisArg)
        InHook = false
        return OriginalReflectApply(Target, () => {}, [])
      } 
      
      InHook = false
      return OriginalReflectApply(Target, ThisArg, Args)
    }
  })
}

RunNamuLinkUserscript(Win)