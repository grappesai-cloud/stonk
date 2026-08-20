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
# HEALTHCHECK se pune pe fiecare serviciu in compose, fiindca porturile difera
# intre agenti. Wget exista in alpine, curl nu: un healthcheck cu curl da
# "unhealthy" pe un container perfect sanatos.
ENTRYPOINT ["node", "bin/fleet.js"]
CMD ["start"]
