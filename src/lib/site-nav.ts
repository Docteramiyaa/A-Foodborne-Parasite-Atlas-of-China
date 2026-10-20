/**
 * 全局站点导航与规范路径
 * ------------------------------------------------------------
 * 入口规则（见前端交互重做方案）：
 * 1. 全局导航只维护在本文件与 Header/Footer；
 * 2. 同一意图只使用一个规范路径：探索 /explore、图鉴 /atlas、依据 /sources；
 * 3. /map 仅作为旧链接重定向，不再作为导航或页面入口。
 */

export const ROUTES = {
  home: '/',
  explore: '/explore',
  atlas: '/atlas',
  chat: '/chat',
  sources: '/sources',
  parasites: '/parasites',
  parasite: (id: string) => `/parasites/${id}`,
  foods: '/foods',
  food: (id: string) => `/foods/${id}`,
  regions: '/regions',
  region: (code: string) => `/regions/${code}`,
} as const;

export type PrimaryNavItem = {
  to: string;
  label: string;
  /** 该导航项在哪些路径下保持 active */
  matches: string[];
};

export const PRIMARY_NAV: PrimaryNavItem[] = [
  { to: ROUTES.explore, label: '探索', matches: ['/explore', '/map'] },
  { to: ROUTES.atlas, label: '图鉴', matches: ['/atlas', '/parasites', '/foods', '/regions'] },
  { to: ROUTES.sources, label: '依据', matches: ['/sources'] },
];

export function isPrimaryNavActive(item: PrimaryNavItem, pathname: string): boolean {
  return item.matches.some((match) => pathname === match || pathname.startsWith(`${match}/`));
}
