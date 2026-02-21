// src/routes/repository.ts
import { Hono } from "hono";
import type { PluginService } from "../service/plugin-service";
import type { AppConfig } from "../config";

export function createRepositoryRoutes(service: PluginService, config: AppConfig) {
  const repo = new Hono();

  // IDE 拉取插件列表
  repo.get("/updatePlugins.xml", (c) => {
    const buildParam = c.req.query("build") || null;

    // 去掉产品前缀（如 "IC-241.15989.150" → "241.15989.150"）
    let buildNumber: string | null = null;
    if (buildParam) {
      const dashIndex = buildParam.indexOf("-");
      buildNumber = dashIndex >= 0 ? buildParam.substring(dashIndex + 1) : buildParam;
    }

    const xml = service.getUpdatePluginsXml(buildNumber);
    return c.body(xml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
    });
  });

  // IDE 下载插件文件
  repo.get("/plugins/:pluginId/:version", async (c) => {
    const { pluginId, version } = c.req.param();
    const filePath = service.getPluginFilePath(pluginId, version);

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return c.json({
        error: "Plugin version not found",
        pluginId,
        version,
      }, 404);
    }

    return new Response(file, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pluginId}-${version}.zip"`,
        "Content-Length": String(file.size),
        "Accept-Ranges": "bytes",
      },
    });
  });

  return repo;
}
