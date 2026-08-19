type SchemaEntry = {
  Path: string
  Schema: unknown
  Value: unknown
}

function IsRecord(Value: unknown): Value is Record<string, unknown> {
  return typeof Value === 'object' && Value !== null
}

function IsStringifiablePrimitive(Value: unknown): Value is null | undefined | string | number | boolean | bigint | symbol {
  return Value === null || (typeof Value !== 'object' && typeof Value !== 'function')
}

function TestRegExp(Schema: RegExp, Value: unknown): boolean {
  if (!IsStringifiablePrimitive(Value)) return false
  return new RegExp(Schema.source, Schema.flags).test(String(Value))
}

function AddPathSegment(Path: string, Key: string): string {
  if (/^(?:[A-Za-z_$][A-Za-z0-9_$]*)$/.test(Key)) return `${Path}.${Key}`
  if (/^(?:0|[1-9]\d*)$/.test(Key)) return `${Path}[${Key}]`
  return `${Path}['${Key.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}']`
}

export function MatchSchema<T>(Value: unknown, Schema: T): string[] {
  const Matches = new Set<string>()
  const Entries: SchemaEntry[] = [{ Path: '$', Schema, Value }]

  while (Entries.length !== 0) {
    const Entry = Entries.pop()
    if (Entry === undefined) continue

    if (Entry.Schema instanceof RegExp) {
      if (TestRegExp(Entry.Schema, Entry.Value)) {
        Matches.add(Entry.Path)
      }
      continue
    }

    if (!IsRecord(Entry.Value) || !IsRecord(Entry.Schema)) continue

    const Keys = Object.keys(Entry.Schema)
    for (let Index = Keys.length - 1; Index >= 0; Index--) {
      const Key = Keys[Index]
      if (Object.hasOwn(Entry.Value, Key)) {
        Entries.push({
          Path: AddPathSegment(Entry.Path, Key),
          Schema: Entry.Schema[Key],
          Value: Entry.Value[Key],
        })
      }
    }
  }

  return [...Matches]
}

export function AddrSchema<T, S>(Value: unknown, Schema: S): Value is T {
  return MatchSchema(Value, Schema).length !== 0
}

export type MatchValueSchemaOptions = {
  /** Require the value to contain exactly as many properties as there are Schemas (default: false, allows extras). */
  Exact?: boolean
}

/** A regex or recursively nested collection of value requirements. */
export type ValueSchema = RegExp | readonly ValueSchema[]

function MatchNestedSchema(Value: unknown, Schema: ValueSchema): boolean {
  if (Schema instanceof RegExp) return TestRegExp(Schema, Value)
  if (!Array.isArray(Value)) {
    if (!IsRecord(Value)) return Schema.length === 1 && MatchNestedSchema(Value, Schema[0])
    return Object.values(Value).some(Child => MatchNestedSchema(Child, Schema))
  }

  const CandidateValues: unknown[] = Value
  const SchemaValues: readonly ValueSchema[] = Schema
  const MatchOfValue = new Array<number | null>(CandidateValues.length).fill(null)
  function TryAssign(SchemaIndex: number, Visited: boolean[]): boolean {
    for (let ValueIndex = 0; ValueIndex < CandidateValues.length; ValueIndex++) {
      if (Visited[ValueIndex] || !MatchNestedDescendant(CandidateValues[ValueIndex], SchemaValues[SchemaIndex])) continue
      Visited[ValueIndex] = true
      const Owner = MatchOfValue[ValueIndex]
      if (Owner === null || TryAssign(Owner, Visited)) {
        MatchOfValue[ValueIndex] = SchemaIndex
        return true
      }
    }
    return false
  }

  for (let SchemaIndex = 0; SchemaIndex < SchemaValues.length; SchemaIndex++) {
    if (!TryAssign(SchemaIndex, new Array(CandidateValues.length).fill(false))) return false
  }
  return true
}

function MatchNestedDescendant(Value: unknown, Schema: ValueSchema): boolean {
  return MatchNestedSchema(Value, Schema)
}

/** Matches recursively nested value requirements regardless of property names/order, returning matched top-level JSONPaths. */
export function MatchValueSchema(Value: unknown, Schemas: readonly ValueSchema[], Options: MatchValueSchemaOptions = {}): string[] {
  if (!IsRecord(Value)) return []

  const Entries = Object.entries(Value)
  if (Options.Exact ? Entries.length !== Schemas.length : Entries.length < Schemas.length) return []

  const MatchOfValue = new Array<number | null>(Entries.length).fill(null)
  function TryAssign(SchemaIndex: number, Visited: boolean[]): boolean {
    for (let ValueIndex = 0; ValueIndex < Entries.length; ValueIndex++) {
      if (Visited[ValueIndex] || !MatchNestedDescendant(Entries[ValueIndex][1], Schemas[SchemaIndex])) continue
      Visited[ValueIndex] = true
      const Owner = MatchOfValue[ValueIndex]
      if (Owner === null || TryAssign(Owner, Visited)) {
        MatchOfValue[ValueIndex] = SchemaIndex
        return true
      }
    }
    return false
  }

  for (let SchemaIndex = 0; SchemaIndex < Schemas.length; SchemaIndex++) {
    if (!TryAssign(SchemaIndex, new Array(Entries.length).fill(false))) return []
  }

  return MatchOfValue.reduce<string[]>((Paths, SchemaIndex, ValueIndex) => {
    if (SchemaIndex !== null) Paths.push(AddPathSegment('$', Entries[ValueIndex][0]))
    return Paths
  }, [])
}

export function AddrValueSchema<T>(Value: unknown, Schemas: readonly ValueSchema[], Options?: MatchValueSchemaOptions): Value is T {
  return MatchValueSchema(Value, Schemas, Options).length !== 0
}

const PathSegmentPattern = /\.([A-Za-z_$][A-Za-z0-9_$]*)|\[(0|[1-9]\d*)\]|\['((?:[^'\\]|\\.)*)'\]/y

/** Parses a JSONPath string produced by {@link AddPathSegment} (e.g. `$.a[0]['b-c']`) back into its key segments. */
export function ParsePath(Path: string): (string | number)[] {
  if (!Path.startsWith('$')) throw new Error(`Invalid JSONPath: ${Path}`)

  const Segments: (string | number)[] = []
  PathSegmentPattern.lastIndex = 1
  while (PathSegmentPattern.lastIndex < Path.length) {
    const StartIndex = PathSegmentPattern.lastIndex
    const Match = PathSegmentPattern.exec(Path)
    if (Match === null || Match.index !== StartIndex) throw new Error(`Invalid JSONPath: ${Path}`)

    if (Match[1] !== undefined) Segments.push(Match[1])
    else if (Match[2] !== undefined) Segments.push(Number(Match[2]))
    else Segments.push(Match[3].replaceAll(/\\(.)/g, '$1'))
  }
  return Segments
}

function IsPlainObject(Value: unknown): Value is Record<string, unknown> {
  return IsRecord(Value) && !Array.isArray(Value)
}

function CloneContainer(Node: unknown, NextKey: string | number): Record<string, unknown> | unknown[] {
  if (typeof NextKey === 'number') return Array.isArray(Node) ? [...Node] : []
  return IsPlainObject(Node) ? { ...Node } : {}
}

const PathValueMarker = Symbol('PathValue')

export type ExplicitPathValue = {
  readonly [PathValueMarker]: unknown
}

/** Marks Value as a literal value, allowing a function to be set without invoking it as an updater. */
export function AsPathValue(Value: unknown): ExplicitPathValue {
  return { [PathValueMarker]: Value }
}

function IsExplicitPathValue(Value: unknown): Value is ExplicitPathValue {
  return IsRecord(Value) && Object.hasOwn(Value, PathValueMarker)
}

export type PathValueOrUpdater = unknown | ((Old: unknown, Key: string | number | undefined, Path: string) => unknown)

/** Immutably sets the value at Path, auto-creating missing intermediate objects/arrays (structural sharing elsewhere). */
export function SetValueAtPath<T = unknown>(Root: unknown, Path: string, ValueOrUpdater: PathValueOrUpdater): T {
  const Segments = ParsePath(Path)
  const TargetKey = Segments.length === 0 ? undefined : Segments[Segments.length - 1]

  function Recurse(Node: unknown, Index: number): unknown {
    if (Index === Segments.length) {
      if (IsExplicitPathValue(ValueOrUpdater)) return ValueOrUpdater[PathValueMarker]
      return typeof ValueOrUpdater === 'function' ? (ValueOrUpdater as (Old: unknown, Key: string | number | undefined, Path: string) => unknown)(Node, TargetKey, Path) : ValueOrUpdater
    }

    const Key = Segments[Index]
    const Container = CloneContainer(Node, Key)
    const OldChild = IsRecord(Node) ? (Node as Record<string | number, unknown>)[Key] : undefined
    ;(Container as Record<string | number, unknown>)[Key] = Recurse(OldChild, Index + 1)
    return Container
  }

  return Recurse(Root, 0) as T
}

/** Immutably removes the property/element at Path; object keys are deleted, array elements are spliced out. Missing paths are a no-op. */
export function DeleteValueAtPath<T = unknown>(Root: unknown, Path: string): T {
  const Segments = ParsePath(Path)
  if (Segments.length === 0) throw new Error('Cannot delete the root value')

  function Recurse(Node: unknown, Index: number): unknown {
    const Key = Segments[Index]
    const IsLast = Index === Segments.length - 1

    if (typeof Key === 'number') {
      if (!Array.isArray(Node) || Key >= Node.length) return Node
      const Clone = [...Node]
      if (IsLast) Clone.splice(Key, 1)
      else Clone[Key] = Recurse(Clone[Key], Index + 1)
      return Clone
    }

    if (!IsPlainObject(Node) || !Object.hasOwn(Node, Key)) return Node
    if (IsLast) {
      const Clone = { ...Node }
      delete Clone[Key]
      return Clone
    }
    return { ...Node, [Key]: Recurse(Node[Key], Index + 1) }
  }

  return Recurse(Root, 0) as T
}