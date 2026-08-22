import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js"

export function createDebounced<T>(source: Accessor<T>, delayMs: number): Accessor<T> {
  const [value, setValue] = createSignal(source())
  createEffect(() => {
    const next = source()
    const timer = setTimeout(() => setValue(() => next), delayMs)
    onCleanup(() => clearTimeout(timer))
  })
  return value
}
