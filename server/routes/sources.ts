/**
 * /api/sources 与 /api/sources/:id
 *
 * 过滤参数：type / reliability / q / entity（关联实体 id）。
 */
import { Router } from 'express';
import type { Source, SourceReliability, SourceType } from '../../shared/types.js';
import { SOURCE_RELIABILITIES, SOURCE_TYPES } from '../data/loader.js';
import { getStore } from '../data/store.js';
import {
  badRequest,
  cache,
  firstError,
  notFoundResponse,
  parseEnumList,
  parseQueryText,
  queryString,
} from './params.js';

export const sourcesRouter = Router();

const listCache = cache(60);

sourcesRouter.get('/', listCache, (req, res) => {
  const store = getStore();
  const errors: string[] = [];
  const types = parseEnumList<SourceType>(req.query.type, SOURCE_TYPES, 'type', errors);
  const reliabilities = parseEnumList<SourceReliability>(
    req.query.reliability,
    SOURCE_RELIABILITIES,
    'reliability',
    errors,
  );
  const q = parseQueryText(req.query.q, 100, 'q', errors);
  const entity = queryString(req.query.entity);
  const message = firstError(errors);
  if (message) {
    badRequest(res, message);
    return;
  }

  let items: Source[] = store.sources;
  if (types.length) items = items.filter((source) => types.includes(source.type));
  if (reliabilities.length) items = items.filter((source) => reliabilities.includes(source.reliability));
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter((source) => {
      const texts = [source.id, source.title, source.authors, source.venue, source.usage, source.citation];
      return texts.some((text) => (text ?? '').toLowerCase().includes(needle));
    });
  }
  if (entity) {
    items = items.filter((source) => {
      const detail = store.getSourceDetail(source.id);
      if (!detail) return false;
      const { citedBy } = detail;
      return (
        citedBy.parasites.some((item) => item.id === entity) ||
        citedBy.foods.some((item) => item.id === entity) ||
        citedBy.regions.some((item) => item.code === entity)
      );
    });
  }
  res.json({ items, total: items.length });
});

sourcesRouter.get('/:id', listCache, (req, res) => {
  const detail = getStore().getSourceDetail(req.params.id);
  if (!detail) {
    notFoundResponse(res, `来源不存在：${req.params.id}`);
    return;
  }
  res.json(detail);
});
