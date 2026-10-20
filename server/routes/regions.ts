/**
 * /api/regions 与 /api/regions/:code
 *
 * :code 支持 6 位 adcode（440000）或 2 位短代码（44）。
 */
import { Router } from 'express';
import { getStore } from '../data/store.js';
import { badRequest, cache, notFoundResponse } from './params.js';

export const regionsRouter = Router();

const listCache = cache(60);

regionsRouter.get('/', listCache, (_req, res) => {
  res.json({ items: getStore().regionSummaries });
});

regionsRouter.get('/:code', listCache, (req, res) => {
  const code = String(req.params.code ?? '').trim();
  if (!/^(\d{6}|\d{2})$/.test(code)) {
    badRequest(res, `地区代码必须是 6 位 adcode 或 2 位短代码（收到 "${code}"）`);
    return;
  }
  const detail = getStore().getRegionDetail(code);
  if (!detail) {
    notFoundResponse(res, `地区不存在：${code}`);
    return;
  }
  res.json(detail);
});
