FROM node:22.20.0-alpine AS builder

WORKDIR /workspace

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY apps/react-frontend ./apps/react-frontend
COPY libs/shared ./libs/shared

ARG VITE_API_URL=
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL

RUN npm ci --legacy-peer-deps \
    && npx nx build react-frontend --configuration=production

FROM nginx:1.27-alpine AS runtime

COPY apps/react-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/dist/apps/react-frontend /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
