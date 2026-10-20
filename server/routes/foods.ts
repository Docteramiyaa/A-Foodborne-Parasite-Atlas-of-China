/**
 * /api/foods 与 /api/foods/:id
 */
import { Router } from 'express';
import type { FoodCategoryId, FoodSummary } from '../../shared/types.js';
import { FOOD_CATEGORY_IDS } from '../data/loader.js';
import { getStore } from '../data/store.js';
import {
  badRequest,
  cache,
  firstError,
  notFoundResponse,
  parseBooleanFlag,
  parseEnumList,
  parseIdList,
  parseQueryText,
} from './params.js';

export const foodsRouter = Router();

const listCache = cache(60);

foodsRouter.get('/', listCache, (req, res) => {
  const store = getStore();
  const errors: string[] = [];
  const taxonomyCategoryIds = store.taxonomy.foodCategories.map((category) => category.id);
  const allowedCategories: readonly FoodCategoryId[] =
    taxonomyCategoryIds.length > 0 ? taxonomyCategoryIds : FOOD_CATEGORY_IDS;
  const categories = parseEnumList<FoodCategoryId>(req.query.category, allowedCategories, 'category', errors);
  const parasiteIds = parseIdList(req.query.parasite, 'parasite', errors);
  const featuredOnly = parseBooleanFlag(req.query.featured, 'featured', errors) === true;
  const q = parseQueryText(req.query.q, 100, 'q', errors);
  const message = firstError(errors);
  if (message) {
    badRequest(res, message);
    return;
  }

  let items: FoodSummary[] = store.foodSummaries;
  if (categories.length) {
    items = items.filter((item) => categories.includes(item.categoryId));
  }
  if (parasiteIds.length) {
    const parasiteSet = new Set(parasiteIds);
    items = items.filter((item) => item.parasiteIds.some((parasiteId) => parasiteSet.has(parasiteId)));
  }
  if (featuredOnly) {
    items = items.filter((item) => item.featured);
  }
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter((item) => {
      const full = store.foodById.get(item.id);
      const texts = [
        item.name,
        item.tagline,
        item.categoryLabel,
        ...(full?.aliases ?? []),
        full?.summary ?? '',
        ...(full?.exampleDishes ?? []).map((dish) => dish.name),
        full?.seasonNote ?? '',
      ];
      return texts.some((text) => text.toLowerCase().includes(needle));
    });
  }
  res.json({ items, total: items.length });
});

foodsRouter.get('/:id', listCache, (req, res) => {
  const detail = getStore().getFoodDetail(req.params.id);
  if (!detail) {
    notFoundResponse(res, `食物不存在：${req.params.id}`);
    return;
  }
  res.json(detail);
});
