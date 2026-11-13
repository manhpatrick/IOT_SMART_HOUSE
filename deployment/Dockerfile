FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3080
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/database ./database
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
COPY --from=build --chown=node:node /app/docs ./docs
RUN mkdir -p /app/.artifacts && chown node:node /app/.artifacts
USER node
EXPOSE 3080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/server.js"]
