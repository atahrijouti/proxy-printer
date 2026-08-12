/**
 * Trailing-edge debounce: delays calling `fn` until `wait` ms have passed
 * without another call. Only the last set of arguments is used.
 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined

  const debounced = (...args: Args) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(...args)
    }, wait)
  }

  debounced.cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }

  return debounced
}
