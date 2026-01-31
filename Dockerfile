FROM node:20-bullseye-slim

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/container

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /home/container/data && chown -R node:node /home/container

EXPOSE 3000

USER node

CMD ["node", "app.js"]
