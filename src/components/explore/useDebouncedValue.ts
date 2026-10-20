import { useEffect, useState } from 'react';

/**
 * 延迟更新一个值：用于条件查询的 300ms 请求防抖。
 * 初次渲染时直接返回原值，因此首屏请求不会被延迟。
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
