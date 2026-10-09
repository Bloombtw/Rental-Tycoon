import { useState } from "react";

/**
 * Counts the changes of `value`: 0 until it changes, then 1, 2... Use it as a React `key` and as
 * `data-pop` so a badge or chip pops when its value changes, never at first render.
 */
export function usePop<T>(value: T): number {
  const [previous, setPrevious] = useState(value);
  const [count, setCount] = useState(0);
  if (!Object.is(previous, value)) {
    setPrevious(value);
    setCount(count + 1);
  }
  return count;
}
