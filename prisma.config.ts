import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // DIRECT_URL bypasses PgBouncer so Prisma can run DDL commands that the
    // pooler doesn't support (e.g. CREATE TABLE inside a transaction).
    url: process.env["DIRECT_URL"],
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
