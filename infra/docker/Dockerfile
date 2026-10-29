FROM node:26.10.0-bookworm-slim

RUN npm install --global pnpm@12.9.1

WORKDIR /workspaces/training2

RUN apt-get update \
  && apt-get install --no-install-recommends -y bash git postgresql-client ca-certificates sudo \
  && rm -rf /var/lib/apt/lists/*

USER node