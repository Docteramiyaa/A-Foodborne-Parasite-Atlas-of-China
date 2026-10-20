/**
 * /api/explore 探索页单一结果（ExploreBriefing）。
 *
 * 产品语义见 docs/INFORMATION_ARCHITECTURE.md：
 * - 条件：province（6 位 adcode 列表）、season（spring|summer|autumn|winter，可逗号多选）、
 *   food（food id 列表）、prep（PreparationTag 列表）、parasite（parasite id 列表）；
 * - 关键词 q 已取消（旧参数忽略，不再参与查询）；
 * - 结果只有一份连贯叙述，具体语义与文案在 services/exploreBriefing.ts。
 *
 * 参数解析/格式校验沿用 routes/params.ts 的模式：非法格式或数据中不存在的 id → 400。
 */
import { Router } from 'express';
import type { ExploreBriefingQuery, PreparationTag, SeasonId } from '../../shared/types.js';
import { PREPARATION_TAGS } from '../data/loader.js';
import { getStore } from '../data/store.js';
import { runExploreBriefing, SEASON_IDS } from '../services/exploreBriefing.js';
import {
  badRequest,
  cache,
  firstError,
  parseAdcodeList,
  parseEnumList,
  parseIdList,
} from './params.js';

export const exploreRouter = Router();

// 前端新页面的命名路由；保持与 /api/explore 完全相同的结果。
exploreRouter.get('/briefing', (req, res) => {
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(307, `/api/explore${query}`);
});

exploreRouter.get('/', cache(60), (req, res) => {
  const store = getStore();
  const errors: string[] = [];

  const provinceCodes = parseAdcodeList(req.query.province, 'province', errors);
  const seasons = parseEnumList<SeasonId>(req.query.season, SEASON_IDS, 'season', errors);
  const foodIds = parseIdList(req.query.food, 'food', errors);
  const parasiteIds = parseIdList(req.query.parasite, 'parasite', errors);
  const taxonomyTags = store.taxonomy.preparations.map((prep) => prep.id);
  const allowedTags: readonly PreparationTag[] = taxonomyTags.length > 0 ? taxonomyTags : PREPARATION_TAGS;
  const preparationTags = parseEnumList<PreparationTag>(req.query.prep, allowedTags, 'prep', errors);

  // 存在性校验：格式合法但知识库中不存在的 id → 400（前端选项均来自 atlas）
  const unknownProvinces = provinceCodes.filter((code) => !store.regionByCode.has(code));
  if (unknownProvinces.length) errors.push(`province 含未知地区代码：${unknownProvinces.join(',')}`);
  const unknownFoods = foodIds.filter((id) => !store.foodById.has(id));
  if (unknownFoods.length) errors.push(`food 含未知食物：${unknownFoods.join(',')}`);
  const unknownParasites = parasiteIds.filter((id) => !store.parasiteById.has(id));
  if (unknownParasites.length) errors.push(`parasite 含未知寄生虫：${unknownParasites.join(',')}`);

  const message = firstError(errors);
  if (message) {
    badRequest(res, message);
    return;
  }

  const query: ExploreBriefingQuery = {};
  if (provinceCodes.length) query.provinceCodes = provinceCodes;
  if (seasons.length) query.seasons = seasons;
  if (foodIds.length) query.foodIds = foodIds;
  if (preparationTags.length) query.preparationTags = preparationTags;
  if (parasiteIds.length) query.parasiteIds = parasiteIds;

  res.json(runExploreBriefing(store, query));
});
