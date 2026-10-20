import { clsx, type ClassValue } from 'clsx';

/** 合并 className（轻量替代 tailwind-merge，冲突类由调用方控制） */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** 稳定伪随机（用于装饰元素，避免 SSR/重渲染闪烁） */
export function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** 把列表转成中文顿号枚举 */
export function joinCn(items: string[], sep = '、'): string {
  return items.join(sep);
}
