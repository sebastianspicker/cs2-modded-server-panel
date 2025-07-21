FROM node:20-bullseye-slim

RUN apt-get update \
  && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/container

RUN mkdir -p /home/container/data \
  && chmod -R 777 /home/container/data

EXPOSE 3000

CMD ["node", "app.js"]
