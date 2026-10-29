FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_BEGINNER_API=1
ENV VITE_BEGINNER_API=$VITE_BEGINNER_API
RUN npm run build

FROM node:22-bookworm-slim AS native
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ make && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY CMakeLists.txt ./
COPY cpp ./cpp
COPY third_party/rapfi ./third_party/rapfi
RUN cmake -S . -B .build/native -DCMAKE_BUILD_TYPE=Release -DNO_MULTI_THREADING=ON \
    && cmake --build .build/native --target rapfi -j 2

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production PORT=8080 GOMOKU_MODELS_DIR=/app/private
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=native /app/.build/native/bin/pbrain-rapfi ./.build/native/bin/pbrain-rapfi
COPY server ./server
COPY scripts/native-client.ts scripts/zero-policy.ts scripts/rules-client.ts ./scripts/
COPY src/game ./src/game
COPY public/engine/rules.js public/engine/rules.wasm ./public/engine/
COPY models/rapfi ./models/rapfi
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --start-period=15s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "server/production.ts"]
