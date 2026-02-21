import { randomBytes } from "crypto";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  authTokens: (process.env.AUTH_TOKENS ?? "").split(",").filter(Boolean),
  dataDir: process.env.DATA_DIR ?? "./data",
  db: {
    type: (process.env.DB_TYPE ?? "sqlite") as "sqlite" | "mysql" | "postgresql",
    url: process.env.DB_URL ?? "registry.db",
  },
  maxFileSize: Number(process.env.MAX_FILE_SIZE ?? 100 * 1024 * 1024), // 100MB
  // Web 管理界面认证
  adminUser: process.env.ADMIN_USER ?? "admin",
  adminPass: process.env.ADMIN_PASS ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? randomBytes(32).toString("hex"),
} as const;

export type AppConfig = typeof config;
