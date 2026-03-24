# DeerFlow Frontend (Next.js) — single-stage build
# Avoids pnpm store symlink issues across multi-stage builds
ARG DEER_FLOW_REF=main
ARG PNPM_STORE_PATH=/root/.local/share/pnpm/store

FROM node:22-alpine AS prod
ARG DEER_FLOW_REF
ARG PNPM_STORE_PATH

RUN apk add --no-cache git
RUN corepack enable && corepack install -g pnpm@10.26.2
RUN pnpm config set store-dir ${PNPM_STORE_PATH}

RUN git clone --depth=1 --branch ${DEER_FLOW_REF} \
    https://github.com/bytedance/deer-flow.git /app

WORKDIR /app/frontend
RUN pnpm install --frozen-lockfile
RUN SKIP_ENV_VALIDATION=1 pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
