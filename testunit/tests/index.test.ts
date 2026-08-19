import test from 'ava'
import { MatchSchema, AddrSchema, MatchValueSchema, AddrValueSchema, ParsePath, AsPathValue, SetValueAtPath, DeleteValueAtPath } from '@userscript/startrick.js'

test('returns JSONPaths for matching values at matching structural paths', T => {
  const Value = {
    profile: { name: 'Ada' },
    tags: ['wiki'],
    'display-name': 'NamuLink',
    ignored: 'not matched',
  }
  const Schema = {
    profile: { name: /^Ada$/ },
    tags: [/^wiki$/],
    'display-name': /^NamuLink$/,
    ignored: /^missing$/,
  }

  T.deepEqual(MatchSchema(Value, Schema), ['$.profile.name', '$.tags[0]', '$[\'display-name\']'])
  T.true(AddrSchema(Value, Schema))
})

test('matches safely stringifiable primitive values only', T => {
  const UnsafeObject = {
    toString(): never { throw new Error('String must not be called') },
    valueOf(): never { throw new Error('valueOf must not be called') },
  }
  const Value = {
    text: 'text',
    number: 42,
    boolean: true,
    bigint: 7n,
    symbol: Symbol('mark'),
    nil: null,
    undefined: undefined,
    object: UnsafeObject,
    fn: () => 'text',
  }
  const Schema = {
    text: /^text$/,
    number: /^42$/,
    boolean: /^true$/,
    bigint: /^7$/,
    symbol: /^Symbol\(mark\)$/,
    nil: /^null$/,
    undefined: /^undefined$/,
    object: /^\[object Object\]$/,
    fn: /^text$/,
  }

  T.deepEqual(MatchSchema(Value, Schema), [
    '$.text', '$.number', '$.boolean', '$.bigint', '$.symbol', '$.nil', '$.undefined',
  ])
})

test('handles nesting deeper than the call stack', T => {
  const Depth = 20_000
  let Value: Record<string, unknown> = { leaf: 'target' }
  let Schema: Record<string, unknown> = { leaf: /^target$/ }

  for (let Index = 0; Index < Depth; Index++) {
    Value = { next: Value }
    Schema = { next: Schema }
  }

  T.deepEqual(MatchSchema(Value, Schema), [`$${'.next'.repeat(Depth)}.leaf`])
})

test('requires the value and schema to share a path', T => {
  T.deepEqual(
    MatchSchema({ value: { target: 'match' } }, { value: { other: /^match$/ } }),
    [],
  )
})

test('MatchValueSchema matches regardless of randomized property names/order', T => {
  const Schemas = [/^[0-9]{8,12}$/, /^[01]$/, /^host\.example\.com$/]
  const Value = { x9f2: '1', qz1: 'host.example.com', a: '123456789' }

  T.deepEqual(MatchValueSchema(Value, Schemas).sort(), ['$.a', '$.qz1', '$.x9f2'])
  T.true(AddrValueSchema(Value, Schemas))
})

test('MatchValueSchema containment mode allows extra properties', T => {
  const Schemas = [/^[0-9]{8,12}$/, /^[01]$/]
  const Value = { a: '123456789', b: '1', c: 'extra', d: 'more-extra' }

  T.deepEqual(MatchValueSchema(Value, Schemas).sort(), ['$.a', '$.b'])
  T.deepEqual(MatchValueSchema(Value, Schemas, { Exact: true }), [])
})

test('MatchValueSchema exact mode requires the same number of properties as schemas', T => {
  const Schemas = [/^[0-9]{8,12}$/, /^[01]$/]
  const Value = { a: '123456789', b: '1' }

  T.deepEqual(MatchValueSchema(Value, Schemas, { Exact: true }).sort(), ['$.a', '$.b'])
})

test('MatchValueSchema requires a distinct value per regex (no reuse via bipartite matching)', T => {
  // Only one value ("1") can satisfy /^[01]$/, but two schemas require it - no perfect matching exists.
  const Schemas = [/^[01]$/, /^[01]$/]
  const Value = { a: '1', b: 'not-a-flag' }

  T.deepEqual(MatchValueSchema(Value, Schemas), [])
})

test('MatchValueSchema matches nested SSR values inside randomized object properties', T => {
  const Image = /\/\/i\.namu\.wiki\/i\/[a-zA-Z0-9-_]+\.[a-z]{3,4}/
  const Schemas = [
    [Image, Image, Image, Image, Image],
    [[/[a-z0-9]{4,6}/], [/[a-z0-9]{4,6}/]],
    [Image, Image],
  ] as const
  const Value = {
    mode: 'vertical',
    ads: [
      { title: 'piano', link: 'piano1.co.kr', labels: [{ text: '상담' }] },
      { title: 'intry', link: 'intry.co.kr', labels: [{ text: '견적' }] },
    ],
    firstImages: [
      '//i.namu.wiki/i/one.png', '//i.namu.wiki/i/two.svg', '//i.namu.wiki/i/three.png',
      '//i.namu.wiki/i/four.svg', '//i.namu.wiki/i/five.png',
    ],
    secondImages: ['//i.namu.wiki/i/six.png', '//i.namu.wiki/i/seven.svg'],
  }

  T.deepEqual(MatchValueSchema(Value, Schemas).sort(), ['$.ads', '$.firstImages', '$.secondImages'])
  T.deepEqual(MatchValueSchema({ ...Value, ads: [{ title: 'only-korean', labels: [{ text: '광고' }] }] }, Schemas), [])
})

test('ParsePath parses identifier, index, and escaped-key segments produced by AddPathSegment', T => {
  T.deepEqual(ParsePath('$'), [])
  T.deepEqual(ParsePath('$.profile.name'), ['profile', 'name'])
  T.deepEqual(ParsePath('$.tags[0]'), ['tags', 0])
  T.deepEqual(ParsePath('$[\'display-name\']'), ['display-name'])
  T.deepEqual(ParsePath('$[\'it\\\'s\\\\here\']'), ['it\'s\\here'])
})

test('ParsePath rejects malformed paths', T => {
  T.throws(() => ParsePath('profile.name'))
  T.throws(() => ParsePath('$.profile..name'))
  T.throws(() => ParsePath('$.9invalid'))
})

test('SetValueAtPath replaces an existing value without mutating the original', T => {
  const Value = { profile: { name: 'Ada' } }
  const Result = SetValueAtPath<typeof Value>(Value, '$.profile.name', 'Grace')

  T.deepEqual(Result, { profile: { name: 'Grace' } })
  T.is(Value.profile.name, 'Ada')
})

test('SetValueAtPath auto-creates missing intermediate objects and arrays', T => {
  const Result = SetValueAtPath<{ A: { B: { C: string }[] } }>({}, '$.A.B[2].C', 'target')
  T.deepEqual(Result, { A: { B: [undefined, undefined, { C: 'target' }] } })
})

test('SetValueAtPath supports an updater function based on the old value', T => {
  const Value = { count: 1 }
  const Result = SetValueAtPath<typeof Value>(Value, '$.count', (Old: unknown) => (Old as number) + 1)
  T.deepEqual(Result, { count: 2 })
})

test('SetValueAtPath passes the original value and type to updater functions', T => {
  const Value = { flag: 1 }
  const Result = SetValueAtPath<typeof Value>(Value, '$.flag', (Old: unknown) => (typeof Old === 'number' && Old === 1 ? 0 : Old))

  T.deepEqual(Result, { flag: 0 })
  T.is(Value.flag, 1)
})

test('SetValueAtPath passes the property Key and target Path to updater functions', T => {
  const Value = { profile: { name: 'Ada' } }
  let ReceivedKey: string | number | undefined
  let ReceivedPath: string | undefined

  SetValueAtPath<typeof Value>(Value, '$.profile.name', (Old: unknown, Key: string | number | undefined, Path: string) => {
    ReceivedKey = Key
    ReceivedPath = Path
    return Old
  })

  T.is(ReceivedKey, 'name')
  T.is(ReceivedPath, '$.profile.name')
})

test('SetValueAtPath passes the array index as Key to updater functions', T => {
  const Value = { list: ['a', 'b'] }
  let ReceivedKey: string | number | undefined

  SetValueAtPath<typeof Value>(Value, '$.list[1]', (Old: unknown, Key: string | number | undefined) => {
    ReceivedKey = Key
    return Old
  })

  T.is(ReceivedKey, 1)
})

test('SetValueAtPath passes an undefined Key for the root path', T => {
  let ReceivedKey: string | number | undefined

  SetValueAtPath({ old: true }, '$', (Old: unknown, Key: string | number | undefined) => {
    ReceivedKey = Key
    return Old
  })

  T.is(ReceivedKey, undefined)
})

test('SetValueAtPath sets a function when it is wrapped as an explicit value', T => {
  const Handler = (): string => 'handled'
  const Result = SetValueAtPath<{ handler: () => string }>({}, '$.handler', AsPathValue(Handler))

  T.is(Result.handler, Handler)
  T.is(Result.handler(), 'handled')
})

test('SetValueAtPath handles escaped-key paths', T => {
  const Value = { 'display-name': 'NamuLink' }
  const Result = SetValueAtPath<typeof Value>(Value, '$[\'display-name\']', 'Renamed')
  T.deepEqual(Result, { 'display-name': 'Renamed' })
})

test('SetValueAtPath replaces the whole root when given the root path', T => {
  T.deepEqual(SetValueAtPath({ old: true }, '$', { fresh: true }), { fresh: true })
})

test('SetValueAtPath followed by MatchSchema on the produced path round-trips', T => {
  const Value = { profile: { name: 'Ada' }, tags: ['wiki'] }
  const Schema = { profile: { name: /^Ada$/ } }
  const [Path] = MatchSchema(Value, Schema)

  const Updated = SetValueAtPath<typeof Value>(Value, Path, 'Grace')
  T.deepEqual(Updated, { profile: { name: 'Grace' }, tags: ['wiki'] })
})

test('DeleteValueAtPath removes an object property without mutating the original', T => {
  const Value = { profile: { name: 'Ada', role: 'admin' } }
  const Result = DeleteValueAtPath<typeof Value>(Value, '$.profile.role')

  T.deepEqual(Result, { profile: { name: 'Ada' } })
  T.is(Value.profile.role, 'admin')
})

test('DeleteValueAtPath splices out an array element, shifting later indices', T => {
  const Value = { tags: ['a', 'b', 'c'] }
  const Result = DeleteValueAtPath<typeof Value>(Value, '$.tags[1]')

  T.deepEqual(Result, { tags: ['a', 'c'] })
  T.deepEqual(Value.tags, ['a', 'b', 'c'])
})

test('DeleteValueAtPath is a no-op when an intermediate path segment does not exist', T => {
  const Value = { profile: { name: 'Ada' } }
  T.deepEqual(DeleteValueAtPath<typeof Value>(Value, '$.missing.name'), Value)
})