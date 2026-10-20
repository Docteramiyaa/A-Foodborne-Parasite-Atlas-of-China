/**
 * Express 应用组装。
 *
 * 职责：json 解析、compression、API 路由挂载、生产静态托管（dist/）、
 * 统一 404 JSON 与错误处理中间件。
 * 监听与进程信号处理在 server/index.ts。
 *
 * 与 backend-rag 的集成点：必须 import { chatRouter } from './routes/chat.js'
 * 并挂载到 /api/chat（契约要求；chat.ts 由 backend-rag 实现）。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { ErrorRequestHandler, Express, NextFunction, Request, Response } from 'express';
import compression from 'compression';
import { config } from './config.js';
import { apiRouter } from './routes/index.js';
import { chatRouter } from './routes/chat.js';
import { notFoundResponse, sendError } from './routes/params.js';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (res.headersSent) return;
  const err = (error ?? {}) as HttpError;
  if (err.type === 'entity.parse.failed') {
    sendError(res, 400, 'BAD_REQUEST', '请求体不是合法的 JSON');
    return;
  }
  if (err.type === 'entity.too.large') {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', '请求体过大');
    return;
  }
  const status = typeof err.status === 'number' ? err.status : typeof err.statusCode === 'number' ? err.statusCode : 500;
  if (status >= 400 && status < 500) {
    sendError(res, status, 'BAD_REQUEST', err.message || '请求参数非法');
    return;
  }
  if (!config.isTest) console.error('[api] 未捕获异常：', error);
  sendError(res, 500, 'INTERNAL_ERROR', '服务器内部错误，请稍后重试');
};

function mountProductionStatic(app: Express): void {
  const indexPath = join(config.distDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.warn(`[api] 未找到前端构建产物（${indexPath}），跳过静态托管；请先执行 npm run build`);
    return;
  }
  app.use(
    express.static(config.distDir, {
      index: false,
      fallthrough: true,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', `public, max-age=${config.immutableCacheSeconds}, immutable`);
        }
      },
    }),
  );
  // SPA 回退：非 /api 的 GET/HEAD 回退到 index.html；/api 已在上方处理
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexPath);
  });
}

export interface CreateAppOptions {
  /** 是否托管 dist/；默认在 NODE_ENV=production 时开启（测试环境关闭） */
  serveStatic?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(compression());
  app.use(express.json({ limit: '256kb' }));

  // 基础安全响应头（不引入额外依赖；如需更严格 CSP 可在反向代理层配置）
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // ModelScope Studio renders apps inside an iframe on modelscope.cn.
    // X-Frame-Options cannot express that cross-origin allow-list; use CSP.
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self' https://www.modelscope.cn https://modelscope.cn https://*.modelscope.cn https://*.modelscope.ai",
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // 对话路由（backend-rag）先挂载，再挂载核心 /api 路由与 /api 404 兜底
  app.use('/api/chat', chatRouter);
  app.use('/api', apiRouter);

  const serveStatic = options.serveStatic ?? config.isProduction;
  if (serveStatic) {
    mountProductionStatic(app);
  } else if (config.isDevelopment) {
    // 开发期直接访问后端根路径时给出提示（前端由 Vite 5173 提供）
    app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: '食源虫谱 · 中国食源性寄生虫地图 API',
        status: 'ok',
        version: config.serviceVersion,
        hint: '开发环境前端地址 http://127.0.0.1:5173；API 前缀 /api',
        endpoints: ['/api/health', '/api/meta', '/api/atlas', '/api/parasites', '/api/foods', '/api/regions', '/api/sources', '/api/search', '/api/explore', '/api/chat'],
      });
    });
  }

  /** 其余未匹配路径：统一 404 JSON（生产模式下 SPA 回退已在上面处理） */
  app.use((req: Request, res: Response) => {
    notFoundResponse(res, `未找到资源：${req.method} ${req.originalUrl}`);
  });

  app.use(errorHandler);
  return app;
}

export default createApp;
