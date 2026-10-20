# 食源虫谱 — ModelScope Studio (Docker) image
# The app is a static Vite build served by a small Express API.

FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7860

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/data ./data
COPY --from=build /app/tsconfig.base.json /app/tsconfig.server.json ./

EXPOSE 7860

CMD ["./node_modules/.bin/tsx", "server/index.ts"]
