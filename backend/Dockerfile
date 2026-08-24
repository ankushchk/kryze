# --- Build Stage ---
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy dependency configs
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including devDependencies for TypeScript compilation)
RUN pnpm install --frozen-lockfile

# Copy prisma schema first to generate Prisma Client
COPY prisma ./prisma/
RUN pnpm prisma:generate

# Copy source code and build TypeScript
COPY . .
RUN pnpm build

# --- Production Runner Stage ---
FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy dependency configs
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy build artifacts and prisma files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# Copy generated Prisma Client binary from builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Run database migrations and start the server
CMD ["sh", "-c", "pnpm prisma db push && pnpm start"]
