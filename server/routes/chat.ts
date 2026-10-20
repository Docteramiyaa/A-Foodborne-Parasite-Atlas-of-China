/**
 * 对话路由
 * ------------------------------------------------------------
 * POST   /api/chat             自然语言问答（RAG）
 * GET    /api/chat/suggestions 对话页初始建议问题（4–6 条）
 *
 * 错误结构遵循 相关约定：
 *   { "error": { "code": "BAD_REQUEST", "message": "..." } }
 * 限流（同一 IP 每分钟 60 次）超限返回 429 + Retry-After。
 * 任何未预期的内部异常都会降级为规则回答（200），不返回 500。
 */
import { Router, type Request } from 'express';
import type { ChatRequest } from '../../shared/types.js';
import {
  ChatError,
  degradedChatResponse,
  getChatSuggestions,
  handleChat,
} from '../rag/chatService.js';

const FALLBACK_SUGGESTIONS = [
  '生吃三文鱼有风险吗？',
  '涮羊肉安全吗？',
  '吃福寿螺要注意什么？',
  '生吃荸荠会感染寄生虫吗？',
  '喝生水有什么风险？',
  '肝吸虫感染后有什么症状？',
];

/** 取客户端 IP（优先 X-Forwarded-For 第一段；Express 已配置 trust proxy 时用 req.ip） */
function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]!;
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export const chatRouter = Router();

chatRouter.post('/', async (req, res) => {
  try {
    const body = (req.body ?? {}) as ChatRequest;
    const response = await handleChat(body, {
      ip: clientIp(req),
      now: new Date(),
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ChatError) {
      res.setHeader('Cache-Control', 'no-store');
      if (error.retryAfterSec != null) res.setHeader('Retry-After', String(error.retryAfterSec));
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    console.error('[chat] 路由层异常，返回降级回答：', error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(degradedChatResponse());
  }
});

chatRouter.get('/suggestions', async (_req, res) => {
  try {
    const suggestions = await getChatSuggestions();
    const ensured = suggestions.length >= 4 ? suggestions.slice(0, 6) : FALLBACK_SUGGESTIONS;
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({ suggestions: ensured });
  } catch (error) {
    console.error('[chat] 获取建议问题失败，使用内置列表：', error);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json({ suggestions: FALLBACK_SUGGESTIONS });
  }
});

export default chatRouter;

