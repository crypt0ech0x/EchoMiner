// prisma.config.ts
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // For Vercel Postgres, migrations should use the NON_POOLING url when available
    url:
      process.env.POSTGRES_URL_NON_POOLING ??
      process.env.POSTGRES_PRISMA_URL ??
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL,
    // optional (only if you set one)
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});