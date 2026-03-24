# DeerFlow Frontend — mirrors bytedance/deer-flow official Dockerfile
# but clones source during build (no local copy needed)
ARG PNPM_STORE_PATH=/root/.local/share/pnpm/store
ARG DEER_FLOW_REF=main

# ── Base: clone + pnpm setup ──────────────────────────────────────────────────
FROM node:22-alpine AS base
ARG PNPM_STORE_PATH
ARG DEER_FLOW_REF
RUN apk add --no-cache git
RUN corepack enable && corepack install -g pnpm@10.26.2
RUN pnpm config set store-dir ${PNPM_STORE_PATH}
RUN git clone --depth=1 --branch ${DEER_FLOW_REF} \
    https://github.com/bytedance/deer-flow.git /app

# ── Builder: install + compile ────────────────────────────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd /app/frontend && pnpm install --frozen-lockfile
RUN cd /app/frontend && SKIP_ENV_VALIDATION=1 pnpm build

# ── Prod: minimal runtime ─────────────────────────────────────────────────────
FROM node:22-alpine AS prod
ARG PNPM_STORE_PATH
RUN corepack enable && corepack install -g pnpm@10.26.2
RUN pnpm config set store-dir ${PNPM_STORE_PATH}
WORKDIR /app
COPY --from=builder /app/frontend ./frontend
EXPOSE 3000
CMD ["sh", "-c", "cd /app/frontend && pnpm start"]
