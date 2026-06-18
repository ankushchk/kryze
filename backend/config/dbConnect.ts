import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL is not set. Starting server without database connection.",
    );
    return;
  }

  try {
    await prisma.$connect();
    console.log("Connected to PostgreSQL with Prisma");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to connect to PostgreSQL with Prisma:", message);
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}