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

import { PL2AdvertHook } from './PL/advert.js'
import { PL2PlaceholderHook } from './PL/placeholder.js'
import { AttachEventListenerToMethod } from './event-attacher.js'

const Win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

// BUILD:START

AttachEventListenerToMethod(PL2AdvertHook, 'fetch', Win)
AttachEventListenerToMethod(PL2PlaceholderHook, 'fetch', Win)