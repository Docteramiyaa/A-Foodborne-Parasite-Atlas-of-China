/**
 * 服务端配置：路径、端口、环境变量。
 *
 * 注意：
 * - LLM 相关环境变量（LLM_PROVIDER / LLM_BASE_URL / LLM_API_KEY ...）由 服务端
 *   在 server/rag/llm.ts 中自行读取，本文件不处理，避免两处所有权交叉。
 * - 不允许在模块加载阶段抛错；所有非法环境变量降级为默认值并 console.warn。
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const serverDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(serverDir, '..');

/**
 * 轻量 .env 加载（不引入 dotenv 依赖）：
 * - 只在项目根目录存在 .env 时读取；
 * - 已存在的进程环境变量优先（方便 CI/生产用真实环境变量覆盖）；
 * - 解析失败静默忽略，不阻断启动。
 */
function loadDotEnv(): void {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue;
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    console.warn(`[config] .env 读取失败，已忽略：${(error as Error).message}`);
  }
}

loadDotEnv();

export type AppEnv = 'development' | 'production' | 'test';

export interface ServerConfig {
  /** 项目根目录（含 data/、dist/、package.json） */
  rootDir: string;
  /** server/ 目录 */
  serverDir: string;
  /** data/ 目录 */
  dataDir: string;
  /** data/geo/ 目录 */
  geoDir: string;
  /** 前端构建产物目录 */
  distDir: string;
  /** public/ 目录（Vite 静态资源，开发期不使用） */
  publicDir: string;
  env: AppEnv;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  /** HTTP 监听端口，默认 8787，可由 PORT 覆盖 */
  port: number;
  /** HTTP 监听地址，默认 127.0.0.1，可由 HOST 覆盖（如 0.0.0.0 供局域网访问） */
  host: string;
  /** 只读 GET 接口缓存秒数（API.md：60） */
  apiCacheSeconds: number;
  /** /api/atlas 缓存秒数（API.md：300） */
  atlasCacheSeconds: number;
  /** 静态 hash 资源长缓存秒数（API.md：1 年） */
  immutableCacheSeconds: number;
  /** 服务版本号（/api/health 的 version 字段；与数据版本无关） */
  serviceVersion: string;
  /** 启动日志中打印的访问地址 */
  displayHost: string;
}

function resolveEnv(): AppEnv {
  const raw = (process.env.NODE_ENV ?? '').trim().toLowerCase();
  if (raw === 'production') return 'production';
  if (raw === 'test') return 'test';
  return 'development';
}

function resolvePort(env: AppEnv): number {
  // 开发期可用 API_PORT 显式指定（与 Vite 代理的 API_PORT 保持一致）；仍兼容 PORT。
  const raw = (process.env.API_PORT ?? process.env.PORT ?? '').trim();
  if (!raw) return 8787;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(`[config] API_PORT/PORT="${raw}" 不是合法端口（1-65535），已回退到 8787`);
    return 8787;
  }
  if (String(port) !== raw) {
    console.warn(`[config] API_PORT/PORT="${raw}" 含非数字字符，按 ${port} 使用`);
  }
  return port;
}

const env = resolveEnv();

function resolveHost(): string {
  const raw = (process.env.HOST ?? '').trim();
  if (!raw) return '127.0.0.1';
  return raw;
}

const host = resolveHost();

export const config: ServerConfig = {
  rootDir,
  serverDir,
  dataDir: join(rootDir, 'data'),
  geoDir: join(rootDir, 'data', 'geo'),
  distDir: join(rootDir, 'dist'),
  publicDir: join(rootDir, 'public'),
  env,
  isProduction: env === 'production',
  isDevelopment: env === 'development',
  isTest: env === 'test',
  port: resolvePort(env),
  host,
  apiCacheSeconds: 60,
  atlasCacheSeconds: 300,
  immutableCacheSeconds: 60 * 60 * 24 * 365,
  serviceVersion: '1.0.0',
  displayHost: host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host,
};

export default config;

