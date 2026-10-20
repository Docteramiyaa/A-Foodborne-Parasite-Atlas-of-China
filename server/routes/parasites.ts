/**
 * /api/parasites 与 /api/parasites/:id
 */
import { Router } from 'express';
import type { ParasiteCategory, ParasiteSummary } from '../../shared/types.js';
import { PARASITE_CATEGORIES } from '../data/loader.js';
import { getStore } from '../data/store.js';
import {
  badRequest,
  cache,
  firstError,
  notFoundResponse,
  parseAdcodeList,
  parseBooleanFlag,
  parseEnumList,
  parseIdList,
  parseMonthList,
  parseQueryText,
} from './params.js';

export const parasitesRouter = Router();

const listCache = cache(60);

parasitesRouter.get('/', listCache, (req, res) => {
  const store = getStore();
  const errors: string[] = [];
  const categories = parseEnumList<ParasiteCategory>(req.query.category, PARASITE_CATEGORIES, 'category', errors);
  const foodIds = parseIdList(req.query.food, 'food', errors);
  const provinceCodes = parseAdcodeList(req.query.province, 'province', errors);
  const months = parseMonthList(req.query.month, 'month', errors);
  const featuredOnly = parseBooleanFlag(req.query.featured, 'featured', errors) === true;
  const q = parseQueryText(req.query.q, 100, 'q', errors);
  const message = firstError(errors);
  if (message) {
    badRequest(res, message);
    return;
  }

  let items: ParasiteSummary[] = store.parasiteSummaries;
  if (categories.length) {
    items = items.filter((item) => categories.includes(item.category));
  }
  if (foodIds.length) {
    const foodSet = new Set(foodIds);
    items = items.filter((item) => item.foodIds.some((foodId) => foodSet.has(foodId)));
  }
  if (provinceCodes.length) {
    const provinceSet = new Set(provinceCodes);
    const parasiteInProvince = new Set<string>();
    for (const region of store.regions) {
      if (!provinceSet.has(region.code)) continue;
      for (const entry of region.entries) for (const id of entry.parasiteIds) parasiteInProvince.add(id);
    }
    items = items.filter((item) => parasiteInProvince.has(item.id));
  }
  if (months.length) {
    items = items.filter((item) => item.seasonPeakMonths.some((month) => months.includes(month)));
  }
  if (featuredOnly) {
    items = items.filter((item) => item.featured);
  }
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter((item) => {
      const full = store.parasiteById.get(item.id);
      const texts = [
        item.name,
        item.latinName,
        item.tagline,
        ...(full?.aliases ?? []),
        full?.summary ?? '',
        ...(full?.riskScenarios ?? []).map((scenario) => scenario.title),
      ];
      return texts.some((text) => text.toLowerCase().includes(needle));
    });
  }
  res.json({ items, total: items.length });
});

parasitesRouter.get('/:id', listCache, (req, res) => {
  const detail = getStore().getParasiteDetail(req.params.id);
  if (!detail) {
    notFoundResponse(res, `寄生虫不存在：${req.params.id}`);
    return;
  }
  res.json(detail);
});
