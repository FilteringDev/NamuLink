// oxlint-disable-next-line typescript/no-explicit-any
type AnyFunction      = (...Args: any[]) => unknown
// oxlint-disable-next-line typescript/no-explicit-any
type AnyAsyncFunction = (...Args: any[]) => Promise<unknown>

type MethodArgs<F> = F extends (...Args: infer A) => unknown ? A : never

type AsyncFunctionKeys<T> = {
  [K in keyof T]-?: T[K] extends AnyAsyncFunction ? K : never
}[keyof T];

type ScopeAsyncMethodKeys<TScope> = AsyncFunctionKeys<TScope> & keyof TScope & string

type MethodThis<F, Fallback> =
  unknown extends ThisParameterType<F> ? Fallback : ThisParameterType<F>

export type MethodCallDetailOf<TScope, K extends keyof TScope & string> = {
  Method: K
  Args: MethodArgs<TScope[K]>
  ThisArg: MethodThis<TScope[K], TScope> | undefined
};

type MethodHookEventName<K extends string = string> = `hook:method:${K}`

type MethodHookEventMap<TScope> = {
  [K in ScopeAsyncMethodKeys<TScope> as MethodHookEventName<K>]:
    CustomEvent<MethodCallDetailOf<TScope, K>>
};

declare global {
  // oxlint-disable-next-line typescript/no-empty-object-type
  interface WindowEventMap extends MethodHookEventMap<Window> {}
}

export function AttachEventListenerToMethod<
  TScope extends EventTarget = Window,
  K extends ScopeAsyncMethodKeys<TScope> = ScopeAsyncMethodKeys<TScope>,
>(
  EventHook: (Ev: CustomEvent<MethodCallDetailOf<TScope, K>>) => void,
  MethodName: K,
  GlobalScope: TScope = window as unknown as TScope,
  HookTarget: EventTarget = GlobalScope,
): void {
  type Method = TScope[K]

  const Scope = GlobalScope as unknown as Record<K, AnyFunction>
  const EventName = `hook:method:${MethodName}`

  HookTarget.addEventListener(EventName, EventHook as EventListener)

  Scope[MethodName] = new Proxy(Scope[MethodName], {
    apply(
      Target: AnyFunction,
      ThisArg: MethodThis<Method, TScope> | undefined,
      Args: MethodArgs<Method>,
    ) {
      const Detail: MethodCallDetailOf<TScope, K> = {
        Method: MethodName,
        Args: Args,
        ThisArg: ThisArg,
      }

      const CEvent = new CustomEvent<MethodCallDetailOf<TScope, K>>(EventName, {
        detail: Detail,
        cancelable: true,
      })

      if (!HookTarget.dispatchEvent(CEvent)) {
        return Promise.reject(new DOMException('Canceled by hook', 'AbortError'))
      }

      // oxlint-disable-next-line typescript/no-unsafe-return
      return Reflect.apply(Target, ThisArg ?? GlobalScope, Args)
    },
  })
}