FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS app
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/data PORT=3000
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/starter/art ./starter/art
EXPOSE 3000
CMD ["npm", "start"]
