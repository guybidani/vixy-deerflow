FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY schema.prisma ./

RUN npm install

# Generate Prisma client from local schema
RUN npx prisma generate --schema=./schema.prisma

COPY src ./src
COPY tsconfig.json ./

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3005/health || exit 1

CMD ["node", "dist/index.js"]
