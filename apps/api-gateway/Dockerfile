FROM node:24-alpine AS builder

WORKDIR /workspace

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY apps/api-gateway ./apps/api-gateway
COPY libs/shared ./libs/shared

RUN npm ci --legacy-peer-deps \
    && npx nx build api-gateway --configuration=production \
    && cd dist/apps/api-gateway \
    && npm install --omit=dev --legacy-peer-deps

FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN mkdir -p /uploads && chown -R node:node /app /uploads

COPY --from=builder --chown=node:node /workspace/dist/apps/api-gateway/ ./

USER node

EXPOSE 3000

ENTRYPOINT ["node", "main.js"]
