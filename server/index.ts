/**
 * 服务启动入口。
 *
 * - 启动前加载知识库并打印数据计数（数据不完整只警告，不阻断）；
 * - 监听端口（PORT，默认 8787）；
 * - NODE_ENV=production 时由 createApp 托管 dist/（hash 资源长缓存、index.html 不缓存、SPA 回退）；
 * - SIGINT / SIGTERM 优雅关闭。
 */
import type { Server } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.js';
import { config } from './config.js';
import { getStore } from './data/store.js';
import { validateStore } from './data/validate.js';
import type { KnowledgeStore } from './data/store.js';

function logDataSummary(store: KnowledgeStore): void {
  const { counts } = store.meta;
  const validation = validateStore(store);
  console.log(
    `[api] 数据：寄生虫 ${counts.parasites} · 食物 ${counts.foods} · 地区 ${counts.regions} · ` +
      `风险规则 ${counts.rules} · 来源 ${counts.sources} · 知识块 ${store.knowledgeChunks.length} · 城市 ${store.cities.length}`,
  );
  console.log(`[api] 数据版本：${store.meta.version}（更新于 ${store.meta.updatedAt || '未知'}）· 当前${store.meta.now.seasonLabel}`);
  if (validation.missing.length) {
    const preview = validation.missing.slice(0, 6).join('；');
    const rest = validation.missing.length > 6 ? `；等 ${validation.missing.length} 项` : '';
    console.warn(`[api] 数据尚未齐全（并行开发期正常）：${preview}${rest}`);
  }
  if (validation.warnings.length) {
    console.warn(`[api] 数据校验警告 ${validation.warnings.length} 项：${validation.warnings.slice(0, 4).join('；')}`);
  }
  if (validation.errors.length) {
    console.error(`[api] 数据校验错误 ${validation.errors.length} 项（服务仍会降级启动）：`);
    for (const error of validation.errors.slice(0, 10)) console.error(`  ✗ ${error}`);
  }
}

function start(): void {
  let store: KnowledgeStore;
  try {
    store = getStore();
  } catch (error) {
    console.error('[api] 知识库加载失败，无法启动：', error);
    process.exitCode = 1;
    return;
  }

  logDataSummary(store);
  const app = createApp();

  const server: Server = app.listen(config.port, config.host, () => {
    console.log(`[api] 食源虫谱 API 已启动（v${config.serviceVersion} · ${config.env}）`);
    console.log(`[api] 监听地址：http://${config.displayHost}:${config.port}（API 前缀 /api）`);
    if (config.isProduction) {
      const hasDist = existsSync(join(config.distDir, 'index.html'));
      console.log(`[api] 静态站点：${hasDist ? config.distDir : '未找到 dist/index.html，仅提供 API'}`);
    }
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[api] 端口 ${config.port} 已被占用：请设置 PORT 环境变量或关闭占用进程`);
    } else if (error.code === 'EACCES') {
      console.error(`[api] 端口 ${config.port} 无权限监听：请改用 1024 以上端口`);
    } else {
      console.error('[api] 服务启动失败：', error);
    }
    process.exitCode = 1;
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] 收到 ${signal}，正在优雅关闭...`);
    const forceTimer = setTimeout(() => {
      console.warn('[api] 关闭超时（5s），强制退出');
      process.exit(1);
    }, 5000);
    forceTimer.unref();
    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        console.error('[api] 关闭时出现错误：', error);
        process.exit(1);
      }
      console.log('[api] 已关闭');
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
