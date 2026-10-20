/**
 * /api/search?q=
 *
 * q 长度 0–100；空字符串返回空结果结构（API.md）。
 */
import { Router } from 'express';
import { getStore } from '../data/store.js';
import { badRequest, cache, firstError, parseQueryText } from './params.js';

export const searchRouter = Router();

searchRouter.get('/', cache(60), (req, res) => {
  const errors: string[] = [];
  const q = parseQueryText(req.query.q, 100, 'q', errors);
  const message = firstError(errors);
  if (message) {
    badRequest(res, message);
    return;
  }
  res.json(getStore().search(q ?? ''));
});
