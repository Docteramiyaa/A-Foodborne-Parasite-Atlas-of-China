/**
 * 路由共享工具：缓存头、统一错误体、查询参数解析与校验。
 *
 * 校验约定（API.md）：
 * - 列表参数用英文逗号分隔；
 * - 非法参数 → 400，错误体 { error: { code, message } }；
 * - 只读 GET 成功响应由各路由设置 Cache-Control。
 */
import type { RequestHandler, Response } from 'express';

/* ========================================================================== */
/* 响应头 / 错误体                                                             */
/* ========================================================================== */

/** 只读 GET 接口缓存：API.md 要求 60 秒，/api/atlas 为 300 秒 */
export function cache(seconds: number): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${Math.max(0, Math.round(seconds))}`);
    next();
  };
}

/** 健康检查等动态接口不缓存 */
export function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export function sendError(res: Response, status: number, code: string, message: string): void {
  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
}

export function badRequest(res: Response, message: string): void {
  sendError(res, 400, 'BAD_REQUEST', message);
}

export function notFoundResponse(res: Response, message: string): void {
  sendError(res, 404, 'NOT_FOUND', message);
}

export function serverError(res: Response, message = '服务器内部错误，请稍后重试'): void {
  sendError(res, 500, 'INTERNAL_ERROR', message);
}

/* ========================================================================== */
/* 查询参数解析                                                                */
/* ========================================================================== */

/** 取单个字符串参数（重复参数取第一个；非字符串忽略） */
export function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === 'string');
    return first?.trim();
  }
  return undefined;
}

/** 逗号分隔列表 → 去重数组（兼容 ?a=1&a=2 的重复参数写法） */
export function queryCsv(value: unknown): string[] {
  const pieces: string[] = [];
  const push = (item: unknown): void => {
    if (typeof item !== 'string') return;
    for (const part of item.split(',')) pieces.push(part);
  };
  if (Array.isArray(value)) value.forEach(push);
  else push(value);
  return [...new Set(pieces.map((piece) => piece.trim()).filter(Boolean))];
}

/**
 * 枚举列表参数（大小写不敏感），非法值写入 errors。
 * 返回去重后的合法值。
 */
export function parseEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  errors: string[],
): T[] {
  const picked: T[] = [];
  for (const token of queryCsv(value)) {
    const normalized = token.toLowerCase();
    const match = allowed.find((item) => item.toLowerCase() === normalized);
    if (!match) {
      errors.push(`${label} 含非法值 "${token}"，可选值：${allowed.join('|')}`);
      continue;
    }
    if (!picked.includes(match)) picked.push(match);
  }
  return picked;
}

/** 月份列表：1–12 整数 */
export function parseMonthList(value: unknown, label = 'month', errors: string[] = []): number[] {
  const months: number[] = [];
  for (const token of queryCsv(value)) {
    if (!/^\d{1,2}$/.test(token)) {
      errors.push(`${label} 必须是 1-12 的整数（收到 "${token}"）`);
      continue;
    }
    const month = Number.parseInt(token, 10);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.push(`${label} 必须是 1-12 的整数（收到 "${token}"）`);
      continue;
    }
    if (!months.includes(month)) months.push(month);
  }
  return months;
}

/** 布尔开关：true / false */
export function parseBooleanFlag(value: unknown, label: string, errors: string[]): boolean | undefined {
  const tokens = queryCsv(value);
  if (!tokens.length) return undefined;
  const token = tokens[tokens.length - 1].toLowerCase();
  if (token === 'true') return true;
  if (token === 'false') return false;
  errors.push(`${label} 只能是 true 或 false（收到 "${token}"）`);
  return undefined;
}

/** 6 位省级 adcode 列表 */
export function parseAdcodeList(value: unknown, label: string, errors: string[]): string[] {
  const codes: string[] = [];
  for (const token of queryCsv(value)) {
    if (!/^\d{6}$/.test(token)) {
      errors.push(`${label} 必须是 6 位省级 adcode（收到 "${token}"）`);
      continue;
    }
    if (!codes.includes(token)) codes.push(token);
  }
  return codes;
}

/** 通用 id 列表（食物 / 寄生虫 / 实体 id）：只做长度与空白防护 */
export function parseIdList(value: unknown, label: string, errors: string[], maxLength = 80): string[] {
  const ids: string[] = [];
  for (const token of queryCsv(value)) {
    if (token.length > maxLength) {
      errors.push(`${label} 含过长 id（超过 ${maxLength} 字符）`);
      continue;
    }
    if (!ids.includes(token)) ids.push(token);
  }
  return ids;
}

/** 文本参数：长度上限校验（search 的 q 为 0–100） */
export function parseQueryText(
  value: unknown,
  maxLength = 100,
  label = 'q',
  errors: string[] = [],
): string | undefined {
  const text = queryString(value);
  if (text === undefined) return undefined;
  if (text.length > maxLength) {
    errors.push(`${label} 长度不能超过 ${maxLength} 个字符（当前 ${text.length}）`);
  }
  return text;
}

/** 校验失败时返回第一个错误信息（错误体只展示一条） */
export function firstError(errors: string[]): string | undefined {
  return errors[0];
}
