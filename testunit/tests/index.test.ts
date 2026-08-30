import { test, expect } from 'vitest'
import { MatchSchema, AddrSchema, MatchValueSchema, AddrValueSchema, ParsePath, AsPathValue, SetValueAtPath, DeleteValueAtPath } from '@userscript/startrick.js'

test('returns JSONPaths for matching values at matching structural paths', () => {
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

  expect(MatchSchema(Value, Schema)).toEqual(['$.profile.name', '$.tags[0]', '$[\'display-name\']'])
  expect(AddrSchema(Value, Schema)).toBe(true)
})

test('matches safely stringifiable primitive values only', () => {
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

  expect(MatchSchema(Value, Schema)).toEqual([
    '$.text', '$.number', '$.boolean', '$.bigint', '$.symbol', '$.nil', '$.undefined',
  ])
})

test('handles nesting deeper than the call stack', () => {
  const Depth = 20_000
  let Value: Record<string, unknown> = { leaf: 'target' }
  let Schema: Record<string, unknown> = { leaf: /^target$/ }

  for (let Index = 0; Index < Depth; Index++) {
    Value = { next: Value }
    Schema = { next: Schema }
  }

  expect(MatchSchema(Value, Schema)).toEqual([`$${'.next'.repeat(Depth)}.leaf`])
})

test('requires the value and schema to share a path', () => {
  expect(MatchSchema({ value: { target: 'match' } }, { value: { other: /^match$/ } })).toEqual([])
})

test('MatchValueSchema matches regardless of randomized property names/order', () => {
  const Schemas = [/^[0-9]{8,12}$/, /^[01]$/, /^host\.example\.com$/]
  const Value = { x9f2: '1', qz1: 'host.example.com', a: '123456789' }

  expect(MatchValueSchema(Value, Schemas).sort()).toEqual(['$.a', '$.qz1', '$.x9f2'])
  expect(AddrValueSchema(Value, Schemas)).toBe(true)
})

test('MatchValueSchema containment mode allows extra properties', () => {
  const Schemas = [/^[0-9]{8,12}$/, /^[01]$/]
  const Value = { a: '123456789', b: '1', c: 'extra', d: 'more-extra' }

  expect(MatchValueSchema(Value, Schemas).sort()).toEqual(['$.a', '$.b'])
  expect(MatchValueSchema(Value, Schemas, { Exact: true })).toEqual([])
})

test('MatchValueSchema exact mode requires the same number of properties as schemas', () => {
  const Schemas = [/^[0-9]{8,12}$/, /^[01]$/]
  const Value = { a: '123456789', b: '1' }

  expect(MatchValueSchema(Value, Schemas, { Exact: true }).sort()).toEqual(['$.a', '$.b'])
})

test('MatchValueSchema requires a distinct value per regex (no reuse via bipartite matching)', () => {
  // Only one value ("1") can satisfy /^[01]$/, but two schemas require it - no perfect matching exists.
  const Schemas = [/^[01]$/, /^[01]$/]
  const Value = { a: '1', b: 'not-a-flag' }

  expect(MatchValueSchema(Value, Schemas)).toEqual([])
})

test('MatchValueSchema matches nested SSR values inside randomized object properties', () => {
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

  expect(MatchValueSchema(Value, Schemas).sort()).toEqual(['$.ads', '$.firstImages', '$.secondImages'])
  expect(MatchValueSchema({ ...Value, ads: [{ title: 'only-korean', labels: [{ text: '광고' }] }] }, Schemas)).toEqual([])
})

test('ParsePath parses identifier, index, and escaped-key segments produced by AddPathSegment', () => {
  expect(ParsePath('$')).toEqual([])
  expect(ParsePath('$.profile.name')).toEqual(['profile', 'name'])
  expect(ParsePath('$.tags[0]')).toEqual(['tags', 0])
  expect(ParsePath('$[\'display-name\']')).toEqual(['display-name'])
  expect(ParsePath('$[\'it\\\'s\\\\here\']')).toEqual(['it\'s\\here'])
})

test('ParsePath rejects malformed paths', () => {
  expect(() => ParsePath('profile.name')).toThrow()
  expect(() => ParsePath('$.profile..name')).toThrow()
  expect(() => ParsePath('$.9invalid')).toThrow()
})

test('SetValueAtPath replaces an existing value without mutating the original', () => {
  const Value = { profile: { name: 'Ada' } }
  const Result = SetValueAtPath<typeof Value>(Value, '$.profile.name', 'Grace')

  expect(Result).toEqual({ profile: { name: 'Grace' } })
  expect(Value.profile.name).toBe('Ada')
})

test('SetValueAtPath auto-creates missing intermediate objects and arrays', () => {
  const Result = SetValueAtPath<{ A: { B: { C: string }[] } }>({}, '$.A.B[2].C', 'target')
  expect(Result).toEqual({ A: { B: [undefined, undefined, { C: 'target' }] } })
})

test('SetValueAtPath supports an updater function based on the old value', () => {
  const Value = { count: 1 }
  const Result = SetValueAtPath<typeof Value>(Value, '$.count', (Old: unknown) => (Old as number) + 1)
  expect(Result).toEqual({ count: 2 })
})

test('SetValueAtPath passes the original value and type to updater functions', () => {
  const Value = { flag: 1 }
  const Result = SetValueAtPath<typeof Value>(Value, '$.flag', (Old: unknown) => (typeof Old === 'number' && Old === 1 ? 0 : Old))

  expect(Result).toEqual({ flag: 0 })
  expect(Value.flag).toBe(1)
})

test('SetValueAtPath passes the property Key and target Path to updater functions', () => {
  const Value = { profile: { name: 'Ada' } }
  let ReceivedKey: string | number | undefined
  let ReceivedPath: string | undefined

  SetValueAtPath<typeof Value>(Value, '$.profile.name', (Old: unknown, Key: string | number | undefined, Path: string) => {
    ReceivedKey = Key
    ReceivedPath = Path
    return Old
  })

  expect(ReceivedKey).toBe('name')
  expect(ReceivedPath).toBe('$.profile.name')
})

test('SetValueAtPath passes the array index as Key to updater functions', () => {
  const Value = { list: ['a', 'b'] }
  let ReceivedKey: string | number | undefined

  SetValueAtPath<typeof Value>(Value, '$.list[1]', (Old: unknown, Key: string | number | undefined) => {
    ReceivedKey = Key
    return Old
  })

  expect(ReceivedKey).toBe(1)
})

test('SetValueAtPath passes an undefined Key for the root path', () => {
  let ReceivedKey: string | number | undefined

  SetValueAtPath({ old: true }, '$', (Old: unknown, Key: string | number | undefined) => {
    ReceivedKey = Key
    return Old
  })

  expect(ReceivedKey).toBe(undefined)
})

test('SetValueAtPath sets a function when it is wrapped as an explicit value', () => {
  const Handler = (): string => 'handled'
  const Result = SetValueAtPath<{ handler: () => string }>({}, '$.handler', AsPathValue(Handler))

  expect(Result.handler).toBe(Handler)
  expect(Result.handler()).toBe('handled')
})

test('SetValueAtPath handles escaped-key paths', () => {
  const Value = { 'display-name': 'NamuLink' }
  const Result = SetValueAtPath<typeof Value>(Value, '$[\'display-name\']', 'Renamed')
  expect(Result).toEqual({ 'display-name': 'Renamed' })
})

test('SetValueAtPath replaces the whole root when given the root path', () => {
  expect(SetValueAtPath({ old: true }, '$', { fresh: true })).toEqual({ fresh: true })
})

test('SetValueAtPath followed by MatchSchema on the produced path round-trips', () => {
  const Value = { profile: { name: 'Ada' }, tags: ['wiki'] }
  const Schema = { profile: { name: /^Ada$/ } }
  const [Path] = MatchSchema(Value, Schema)

  const Updated = SetValueAtPath<typeof Value>(Value, Path, 'Grace')
  expect(Updated).toEqual({ profile: { name: 'Grace' }, tags: ['wiki'] })
})

test('DeleteValueAtPath removes an object property without mutating the original', () => {
  const Value = { profile: { name: 'Ada', role: 'admin' } }
  const Result = DeleteValueAtPath<typeof Value>(Value, '$.profile.role')

  expect(Result).toEqual({ profile: { name: 'Ada' } })
  expect(Value.profile.role).toBe('admin')
})

test('DeleteValueAtPath splices out an array element, shifting later indices', () => {
  const Value = { tags: ['a', 'b', 'c'] }
  const Result = DeleteValueAtPath<typeof Value>(Value, '$.tags[1]')

  expect(Result).toEqual({ tags: ['a', 'c'] })
  expect(Value.tags).toEqual(['a', 'b', 'c'])
})

test('DeleteValueAtPath is a no-op when an intermediate path segment does not exist', () => {
  const Value = { profile: { name: 'Ada' } }
  expect(DeleteValueAtPath<typeof Value>(Value, '$.missing.name')).toEqual(Value)
})