/**
 * /api 路由汇总。
 *
 * 注意：/api/chat 由 server/app.ts 直接挂载 chatRouter（backend-rag 所有权），
 * 不放进本文件，以避免与 chat 路由的 404/错误处理顺序耦合。
 */
import { Router } from 'express';
import { exploreRouter } from './explore.js';
import { foodsRouter } from './foods.js';
import { metaRouter } from './meta.js';
import { notFoundResponse } from './params.js';
import { parasitesRouter } from './parasites.js';
import { regionsRouter } from './regions.js';
import { searchRouter } from './search.js';
import { sourcesRouter } from './sources.js';

export const apiRouter = Router();

apiRouter.use(metaRouter);
apiRouter.use('/parasites', parasitesRouter);
apiRouter.use('/foods', foodsRouter);
apiRouter.use('/regions', regionsRouter);
apiRouter.use('/sources', sourcesRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/explore', exploreRouter);

/** /api 下未匹配的路径：统一 404 JSON（不是 SPA 回退） */
apiRouter.use((req, res) => {
  notFoundResponse(res, `未知接口：${req.method} ${req.originalUrl}`);
});

export default apiRouter;
