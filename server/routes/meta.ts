/**
 * /api/health、/api/meta、/api/atlas
 */
import { Router } from 'express';
import type { AtlasPayload } from '../../shared/types.js';
import { config } from '../config.js';
import { getStore } from '../data/store.js';
import { cache, noStore } from './params.js';

export const metaRouter = Router();

metaRouter.get('/health', (_req, res) => {
  noStore(res);
  const store = getStore();
  res.json({
    ok: true,
    version: config.serviceVersion,
    uptimeMs: Math.round(process.uptime() * 1000),
    dataVersion: store.meta.version,
  });
});

metaRouter.get('/meta', cache(config.apiCacheSeconds), (_req, res) => {
  res.json(getStore().meta);
});

metaRouter.get('/atlas', cache(config.atlasCacheSeconds), (_req, res) => {
  const store = getStore();
  const payload: AtlasPayload = {
    meta: store.meta,
    taxonomy: store.taxonomy,
    parasites: store.parasiteSummaries,
    foods: store.foodSummaries,
    regions: store.regionSummaries,
    sources: store.sources,
  };
  res.json(payload);
});
