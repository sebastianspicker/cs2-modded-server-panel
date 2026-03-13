FROM node:20-bullseye-slim

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/container

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && \
  rm -rf /root/.npm /tmp/*

COPY --chown=node:node . .

RUN mkdir -p /home/container/data && chown -R node:node /home/container

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "app.js"]
