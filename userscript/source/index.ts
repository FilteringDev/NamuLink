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
// oxlint-disable-next-line namulink/pascal-case
declare const unsafeWindow: unsafeWindow

import { MatchValueSchema, SetValueAtPath, type ValueSchema } from './startrick.js'

const Win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
const UserscriptName = 'NamuLink'

// BUILD:START

const PLInitTracking = /\[?\[\[\[( *null *,)? *\\? *" *! *\/jump\/[a-zA-Z0-9\/=\\+]+ *\\? *" *, *.+[\[\[ *null *, *\\? *" *! *\/jump\/[a-zA-Z0-9\/=\\+]+ *\\? *" *, *.+\/\/i\.namu.wiki\/i\//

const PLSSRImage = /\/\/i\.namu\.wiki\/i\/[a-zA-Z0-9-_]+\.[a-z]{3,4}/

Win.Reflect.set = new Proxy(Win.Reflect.set, {
  apply(Target: typeof Reflect.set, ThisArg: Set<unknown>, ArgArray: Parameters<typeof Reflect.set>) {
    // Property names are randomized, so only the set of values (regardless of key/order) is checked.
    const PLInitSchema = [
      /[0-9]{8,12}/,
      /[0-9]{8,12}/,
      /[0-9]{8,12}/,
      /[0-9]{8,12}/,
      /[0-9]{1,3}\.[0-9]{12,20}/,
      /[a-zA-Z0-9\/=\\+]{20,}/,
      /^[01]$/,
      /^[01]$/,
      /^[01]$/,
      /^[01]$/,
      /^[01]$/,
      PLInitTracking
    ]

    const PLSSRSchema: ValueSchema[] = [[
      PLSSRImage,
      PLSSRImage,
      PLSSRImage,
      PLSSRImage,
      PLSSRImage
    ], [[
      /[a-z0-9]{4,6}/
    ], [
      /[a-z0-9]{4,6}/
    ]], [
      PLSSRImage,
      PLSSRImage
    ]]

    for (let I = 0; I < ArgArray.length; I++) {
      const Arg = ArgArray[I]

      let Matches: string[] = MatchValueSchema(Arg, PLInitSchema, { Exact: false })
      if (Matches.length !== 0) {
        console.debug(`${UserscriptName} detected a potential PLSchema match at argument index ${I} and matches:`, Matches, Arg)
        let ModifiedArg = ArgArray.map((Value, Index) => {
          if (Index === I) return SetValueAtPath(Value, Matches[0], (OldValue: unknown, Key: string | number | undefined, Path: string) => {
            switch (true) {
              case typeof OldValue === 'string' && OldValue === '1' && Key === 'enable_ads':
                return '0'
              case typeof OldValue === 'number' && OldValue === 1 && Key === 'enable_ads':
                return 0
              case typeof OldValue === 'string' && PLInitTracking.test(OldValue):
                return ''
              case typeof OldValue === 'string' && /[a-zA-Z0-9\/=\\+]{20,}/.test(OldValue):
                return ''
              default:
                return OldValue
            }
          })
          return Value
        })
        return Reflect.apply(Target, ThisArg, ModifiedArg)
      }

      Matches = MatchValueSchema(Arg, PLSSRSchema, { Exact: false })
      if (Matches.length !== 0) {
        console.debug(`${UserscriptName} detected a potential PLSSR schema match at argument index ${I} and matches:`, Matches, Arg)
        let ModifiedArg = ArgArray.map((Value, Index) => {
          if (Index === I) return SetValueAtPath(Value, Matches[0], (OldValue: unknown, Key: string | number | undefined, Path: string) => {
            switch (true) {
              case typeof OldValue === 'boolean':
                return false
              default:
                return undefined
            }
          })
          return Value
        })
        return Reflect.apply(Target, ThisArg, ModifiedArg)
      }
    }

    return Reflect.apply(Target, ThisArg, ArgArray)
  }
})