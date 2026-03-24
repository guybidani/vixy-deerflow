# DeerFlow Frontend (Next.js)
# Builds from bytedance/deer-flow source
ARG PNPM_STORE_PATH=/root/.local/share/pnpm/store
ARG DEER_FLOW_REF=main

# ── Source clone ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS source
ARG DEER_FLOW_REF
RUN apk add --no-cache git
RUN git clone --depth=1 --branch ${DEER_FLOW_REF} \
    https://github.com/bytedance/deer-flow.git /app

# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
ARG PNPM_STORE_PATH
RUN corepack enable && corepack install -g pnpm@10.26.2
RUN pnpm config set store-dir ${PNPM_STORE_PATH}

WORKDIR /app
COPY --from=source /app/frontend ./frontend

RUN cd frontend && pnpm install --frozen-lockfile
RUN cd frontend && SKIP_ENV_VALIDATION=1 pnpm build

# ── Production runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS prod
ARG PNPM_STORE_PATH
RUN corepack enable && corepack install -g pnpm@10.26.2
RUN pnpm config set store-dir ${PNPM_STORE_PATH}

WORKDIR /app
# Copy source for package.json / lockfile
COPY --from=source /app/frontend ./frontend
# Copy built .next output
COPY --from=builder /app/frontend/.next ./frontend/.next
# Install deps fresh so pnpm store + node_modules are consistent
RUN cd frontend && pnpm install --frozen-lockfile --prod

EXPOSE 3000
CMD ["sh", "-c", "cd /app/frontend && pnpm start"]
