import { Hono } from "hono";
import { createRepositoryRoutes } from "../../src/routes/repository";
import { createApiRoutes } from "../../src/routes/api";
import { PluginService } from "../../src/service/plugin-service";
import { PluginParser } from "../../src/service/plugin-parser";
import { createTestRepository } from "./test-repository";
import { createTempDataDir } from "./fixtures";

interface TestApp {
  app: Hono;
  service: PluginService;
  cleanup: () => Promise<void>;
}

/**
 * 创建完整的测试应用，包含所有路由。
 * 每次调用都会创建独立的内存数据库和临时数据目录。
 */
export async function createTestApp(overrides?: {
  authTokens?: string[];
  adminUser?: string;
  adminPass?: string;
  sessionSecret?: string;
  baseUrl?: string;
}): Promise<TestApp> {
  const { path: dataDir, cleanup } = await createTempDataDir();
  const { mkdir } = await import("fs/promises");
  await mkdir(`${dataDir}/plugins`, { recursive: true });
  await mkdir(`${dataDir}/tmp`, { recursive: true });

  const repository = createTestRepository();
  const parser = new PluginParser();

  const config = {
    port: 3000,
    baseUrl: overrides?.baseUrl ?? "http://localhost:3000",
    authTokens: overrides?.authTokens ?? ["test-token"],
    dataDir,
    db: { type: "sqlite" as const, url: ":memory:" },
    maxFileSize: 100 * 1024 * 1024,
    adminUser: overrides?.adminUser ?? "admin",
    adminPass: overrides?.adminPass ?? "test-password",
    sessionSecret: overrides?.sessionSecret ?? "test-secret",
  };

  const service = new PluginService(repository, parser, dataDir, config.baseUrl);

  const app = new Hono();
  app.route("/", createRepositoryRoutes(service, config));
  app.route("/api", createApiRoutes(service, config));

  // Web 路由按需加载（可能尚未实现）
  try {
    const { createWebRoutes } = await import("../../src/routes/web");
    app.route("/", createWebRoutes(service, config));
  } catch {
    // Web 路由尚未实现，跳过
  }

  return { app, service, cleanup };
}
