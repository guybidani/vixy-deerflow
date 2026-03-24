# DeerFlow Backend (Gateway + LangGraph)
# Builds from bytedance/deer-flow source, overlays Vixy/Adam config
FROM python:3.12-slim

ARG NODE_MAJOR=22
ARG DEER_FLOW_REF=main

# System deps + Node.js (for MCP servers via npx)
RUN apt-get update && apt-get install -y \
    curl build-essential gnupg ca-certificates git \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI (DooD: sandbox containers via host Docker socket)
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker

# uv (Python package manager)
COPY --from=ghcr.io/astral-sh/uv:0.7.20 /uv /uvx /usr/local/bin/

# Clone deer-flow source
RUN git clone --depth=1 --branch ${DEER_FLOW_REF} \
    https://github.com/bytedance/deer-flow.git /app

WORKDIR /app

# Install backend Python deps
RUN --mount=type=cache,target=/root/.cache/uv \
    sh -c "cd backend && uv sync"

EXPOSE 8001 2024

CMD ["sh", "-c", "cd backend && PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --workers 2"]
