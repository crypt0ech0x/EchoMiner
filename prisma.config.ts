// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    // Must be a DIRECT Postgres URL (not prisma+postgres)
    url: env("DATABASE_URL"),
  },
});