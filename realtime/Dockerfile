FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache wget sudo \
    && addgroup -g 1001 -S aruna \
    && adduser -S aruna -u 1001 -G aruna \
    && echo 'aruna ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/aruna \
    && chmod 440 /etc/sudoers.d/aruna
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY --from=builder /app/dist ./dist
RUN chown -R aruna:aruna /app
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD sudo -u aruna wget -qO- http://localhost:3002/health/ready || exit 1
CMD ["sudo", "-E", "-u", "aruna", "node", "dist/index.js"]
