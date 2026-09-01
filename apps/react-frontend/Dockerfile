FROM node:24-alpine AS builder

WORKDIR /workspace

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY apps/react-frontend ./apps/react-frontend
COPY libs/shared ./libs/shared

ARG VITE_API_URL=
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL

RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps \
    && npx nx build react-frontend --configuration=production

FROM nginx:1.27-alpine

COPY apps/react-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/dist/apps/react-frontend /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
