import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/repository/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATA_DIR
      ? `${process.env.DATA_DIR}/${process.env.DB_URL ?? "registry.db"}`
      : "./data/registry.db",
  },
});
