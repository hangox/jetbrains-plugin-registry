import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "./config";
import { createRepository } from "./repository";
import { PluginParser } from "./service/plugin-parser";
import { PluginService } from "./service/plugin-service";
import { createRepositoryRoutes } from "./routes/repository";
import { createApiRoutes } from "./routes/api";
import { createWebRoutes } from "./routes/web";
import { mkdir } from "fs/promises";

// 启动校验
if (!config.adminPass) {
  console.warn("WARNING: ADMIN_PASS is not set. Web management login will be disabled.");
}
if (config.authTokens.length === 0) {
  console.warn("WARNING: AUTH_TOKENS is not set. API upload/delete will be blocked.");
}

// 初始化数据目录
await mkdir(`${config.dataDir}/plugins`, { recursive: true });
await mkdir(`${config.dataDir}/tmp`, { recursive: true });

// 初始化各层
const repository = createRepository();
repository.initialize();

const parser = new PluginParser();
const service = new PluginService(repository, parser, config.dataDir, config.baseUrl);

// 组装 Hono 应用
const app = new Hono();

// 全局中间件
app.use("*", logger());

// 挂载路由
app.route("/", createRepositoryRoutes(service, config));   // /updatePlugins.xml, /plugins/*
app.route("/api", createApiRoutes(service, config));       // /api/plugins, /api/health, /api/stats
app.route("/", createWebRoutes(service, config));          // /, /web/*

console.log(`Plugin Registry started on port ${config.port}`);
console.log(`  Base URL: ${config.baseUrl}`);
console.log(`  Data dir: ${config.dataDir}`);
console.log(`  Database: ${config.db.type}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
