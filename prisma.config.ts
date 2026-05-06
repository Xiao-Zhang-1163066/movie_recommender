import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // migrations: {
  //   path: "prisma/migrations",
  //   url: process.env["DIRECT_URL"],
  // },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
