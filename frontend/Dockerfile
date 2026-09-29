# syntax=docker/dockerfile:1

# ---- build the static bundle -------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Leave empty to call the API on the same origin (/api/v1, proxied by nginx).
# Set to a full URL (https://api.example.com/api/v1) when the API lives elsewhere.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---- serve with nginx ----------------------------------------------------------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
