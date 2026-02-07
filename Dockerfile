FROM node:22-slim

RUN apt-get update && apt-get install -y tmux && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/ packages/
COPY config/ config/

RUN pnpm install --frozen-lockfile
RUN pnpm build

CMD ["node", "packages/cli/dist/index.js"]
