// src/routes/api.ts
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import type { PluginService } from "../service/plugin-service";
import type { AppConfig } from "../config";

export function createApiRoutes(service: PluginService, config: AppConfig) {
  const api = new Hono();

  // Bearer Token 认证中间件（仅保护写操作）
  const auth = bearerAuth({
    verifyToken: (token) => config.authTokens.includes(token),
  });

  // ── 只读接口 ──

  // 查询插件列表
  api.get("/plugins", (c) => {
    const query = c.req.query("query") || null;
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
    const result = service.listPlugins(query, page, pageSize);
    return c.json(result);
  });

  // 查询插件详情
  api.get("/plugins/:pluginId", (c) => {
    const pluginId = c.req.param("pluginId");
    const plugin = service.getPlugin(pluginId);
    if (!plugin) {
      return c.json({ error: "Plugin not found" }, 404);
    }
    return c.json(plugin);
  });

  // 健康检查
  api.get("/health", (c) => {
    return c.json({
      status: "ok",
      uptime: service.getUptime(),
      database: "connected",
      version: "1.0.0",
    });
  });

  // 存储统计
  api.get("/stats", (c) => {
    const stats = service.getStats();
    const recentUploads = service.getRecentUploads(10);
    return c.json({
      ...stats,
      totalStorageHuman: formatBytes(stats.totalStorageBytes),
      recentUploads,
    });
  });

  // ── 写操作（需认证） ──

  // 上传插件
  api.post("/plugins", auth, async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"] as File;
    const force = c.req.query("force") === "true";

    if (!file || file.size === 0) {
      return c.json({ error: "No file provided" }, 400);
    }

    if (file.size > config.maxFileSize) {
      const maxMb = Math.round(config.maxFileSize / 1024 / 1024);
      return c.json({ error: `File too large. Max size: ${maxMb}MB` }, 413);
    }

    try {
      const result = await service.upload(file, force);
      return c.json(result, 201);
    } catch (e) {
      if (e instanceof Error && e.message.includes("already exists")) {
        return c.json({ error: e.message }, 409);
      }
      if (e instanceof Error && e.name === "InvalidPluginError") {
        return c.json({ error: e.message }, 400);
      }
      throw e;
    }
  });

  // 删除指定版本
  api.delete("/plugins/:pluginId/:version", auth, async (c) => {
    const { pluginId, version } = c.req.param();
    const existing = service.getPlugin(pluginId);
    if (!existing || !existing.versions.find((v) => v.version === version)) {
      return c.json({ error: "Plugin version not found" }, 404);
    }

    const remaining = await service.deleteVersion(pluginId, version);
    return c.json({
      message: `Deleted ${pluginId} version ${version}`,
      remainingVersions: remaining,
    });
  });

  // 删除整个插件
  api.delete("/plugins/:pluginId", auth, async (c) => {
    const pluginId = c.req.param("pluginId");
    const existing = service.getPlugin(pluginId);
    if (!existing) {
      return c.json({ error: "Plugin not found" }, 404);
    }

    const versionCount = existing.versions.length;
    await service.deletePlugin(pluginId);
    return c.json({
      message: `Deleted ${pluginId} with all ${versionCount} versions`,
    });
  });

  return api;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
