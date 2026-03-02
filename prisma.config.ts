import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    provider: "postgresql",
    url: process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL,
  },
});