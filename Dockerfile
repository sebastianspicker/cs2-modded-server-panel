FROM node:20-bullseye-slim

RUN apt-get update \
  && apt-get install -y python3 make g++ git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/container

EXPOSE 3000

CMD ["bash"]
