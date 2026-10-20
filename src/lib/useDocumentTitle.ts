import { useEffect } from 'react';

const SITE = '食源虫谱 · 中国食源性寄生虫图谱';

/** 设置页面标题与描述（无路由级 SSR，仅客户端） */
export function useDocumentTitle(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : SITE;
    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', description);
    }
  }, [title, description]);
}
