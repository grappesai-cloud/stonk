FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json tsconfig.build.json ./
RUN npm ci
COPY src ./src
RUN npx tsc -p tsconfig.build.json

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production LOG_FORMAT=json
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY bin ./bin
COPY config ./config
# datele stau pe volum: registrul e produsul, nu se pierde la redeploy
VOLUME ["/app/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1
ENTRYPOINT ["node", "bin/courier.js"]
CMD ["start"]
