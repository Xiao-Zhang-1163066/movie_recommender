import "dotenv/config";
import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

// DATABASE_URL is the Neon pooled URL (PgBouncer). DIRECT_URL bypasses the
// pooler and is used only for migrations in prisma.config.ts.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,                    // stay within Neon's pooler connection limit
  idleTimeoutMillis: 10_000,  // release idle connections quickly
  connectionTimeoutMillis: 5_000, // fail fast rather than queue indefinitely
});

const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
});

// const prisma = new PrismaClient({
//   log:
//     process.env.NODE_ENV === "development"
//       ? ["query", "info", "warn", "error"]
//       : ["error"],
// });

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log("DB connected via Prisma");
  } catch (error) {
    console.error("DB connection error:", error);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  await prisma.$disconnect();
};

export { connectDB, disconnectDB, prisma };
