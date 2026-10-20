import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/layout/Shell';
import { HomePage } from '@/pages/HomePage';

/* 页面级代码分割：首页（含地图）同步加载，其余按需加载。 */
const ExplorePage = lazy(() => import('@/pages/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const MapRedirectPage = lazy(() => import('@/pages/MapRedirectPage').then((m) => ({ default: m.MapRedirectPage })));
const AtlasHubPage = lazy(() => import('@/pages/AtlasHubPage').then((m) => ({ default: m.AtlasHubPage })));
const ParasitesPage = lazy(() => import('@/pages/ParasitesPage').then((m) => ({ default: m.ParasitesPage })));
const ParasitePage = lazy(() => import('@/pages/ParasitePage').then((m) => ({ default: m.ParasitePage })));
const FoodsPage = lazy(() => import('@/pages/FoodsPage').then((m) => ({ default: m.FoodsPage })));
const FoodPage = lazy(() => import('@/pages/FoodPage').then((m) => ({ default: m.FoodPage })));
const RegionsPage = lazy(() => import('@/pages/RegionsPage').then((m) => ({ default: m.RegionsPage })));
const RegionPage = lazy(() => import('@/pages/RegionPage').then((m) => ({ default: m.RegionPage })));
const SourcesPage = lazy(() => import('@/pages/SourcesPage').then((m) => ({ default: m.SourcesPage })));
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

export function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="explore" element={<ExplorePage />} />
          {/* 旧地图入口：只做兼容重定向，地图已并入探索工作台 */}
          <Route path="map" element={<MapRedirectPage />} />
          <Route path="atlas" element={<AtlasHubPage />} />
          <Route path="parasites" element={<ParasitesPage />} />
          <Route path="parasites/:id" element={<ParasitePage />} />
          <Route path="foods" element={<FoodsPage />} />
          <Route path="foods/:id" element={<FoodPage />} />
          <Route path="regions" element={<RegionsPage />} />
          <Route path="regions/:code" element={<RegionPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
