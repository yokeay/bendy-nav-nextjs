import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __bendyPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });
}

const prisma: PrismaClient = global.__bendyPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__bendyPrisma = prisma;
}

export default prisma;
