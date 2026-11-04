# 构建应用
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_SITE_URL=nest.alvis.org.cn
ENV VITE_SITE_URL=${VITE_SITE_URL}
RUN cp .env.example .env && pnpm build

# 最小化镜像
FROM node:22-alpine
WORKDIR /app
RUN npm install -g http-server@14.1.1
COPY --from=builder --chown=node:node /app/dist ./dist
USER node

EXPOSE 12445
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:12445/',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["http-server", "dist", "-p", "12445"]
