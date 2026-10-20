import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 端口可通过环境变量覆盖，避免与其他本地服务冲突；默认值保持 5173 / 8787 不变。
const webPort = Number(process.env.WEB_PORT ?? 5173);
const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? process.env.PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolvePath('./src'),
      '@shared': resolvePath('./shared'),
      '@data': resolvePath('./data'),
    },
  },
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
