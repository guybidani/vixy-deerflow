# DeerFlow Frontend (Next.js) — single-stage build
ARG DEER_FLOW_REF=main

FROM node:22-alpine AS prod
ARG DEER_FLOW_REF

RUN apk add --no-cache git
RUN npm install -g pnpm@10.26.2

RUN git clone --depth=1 --branch ${DEER_FLOW_REF} \
    https://github.com/bytedance/deer-flow.git /app

WORKDIR /app/frontend
RUN pnpm install --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN SKIP_ENV_VALIDATION=1 pnpm build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["pnpm", "start"]
