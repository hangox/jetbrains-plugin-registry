// src/routes/web.tsx
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { PluginListPage } from "../views/plugin-list";
import { PluginDetailPage } from "../views/plugin-detail";
import { PluginNotFoundPage } from "../views/not-found";
import { UploadPage } from "../views/upload";
import { StatsPage } from "../views/stats";
import { LoginPage } from "../views/login";
import { getFlash, redirectWithFlash } from "../lib/flash";
import type { PluginService } from "../service/plugin-service";
import type { AppConfig } from "../config";
import type { AppVariables } from "../types";

export function createWebRoutes(service: PluginService, config: AppConfig) {
  const web = new Hono<{ Variables: AppVariables }>();

  // ──────────────────────────────────────────────
  // Session 中间件：解析 cookie，注入 isLoggedIn
  // ──────────────────────────────────────────────
  web.use("*", async (c, next) => {
    const sessionToken = getCookie(c, "session");
    c.set("isLoggedIn", sessionToken === config.sessionSecret);
    await next();
  });

  // ──────────────────────────────────────────────
  // requireAuth 中间件：保护写操作路由
  // ──────────────────────────────────────────────
  const requireAuth = async (c: any, next: any) => {
    if (!c.get("isLoggedIn")) {
      const returnTo = encodeURIComponent(c.req.path);
      return c.redirect(`/web/login?returnTo=${returnTo}`);
    }
    await next();
  };

  // ──────────────────────────────────────────────
  // 登录页面
  // ──────────────────────────────────────────────
  web.get("/web/login", (c) => {
    if (c.get("isLoggedIn")) {
      return c.redirect("/");
    }
    const error = c.req.query("error") || null;
    const returnTo = c.req.query("returnTo") || "/";
    return c.html(<LoginPage error={error} returnTo={returnTo} />);
  });

  // 登录处理
  web.post("/web/login", async (c) => {
    const body = await c.req.parseBody();
    const username = body["username"] as string;
    const password = body["password"] as string;
    const returnTo = (body["returnTo"] as string) || "/";

    if (username === config.adminUser && password === config.adminPass) {
      setCookie(c, "session", config.sessionSecret, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 天
      });
      return c.redirect(returnTo);
    }

    return c.redirect(`/web/login?error=${encodeURIComponent("Invalid username or password")}&returnTo=${encodeURIComponent(returnTo)}`);
  });

  // 登出处理
  web.post("/web/logout", (c) => {
    deleteCookie(c, "session", { path: "/" });
    return c.redirect("/web/login");
  });

  // ──────────────────────────────────────────────
  // 首页 — 插件列表（公开）
  // ──────────────────────────────────────────────
  web.get("/", (c) => {
    const query = c.req.query("query") || null;
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const result = service.listPlugins(query, page, 20);
    const flash = getFlash(c);
    const isLoggedIn = c.get("isLoggedIn");
    return c.html(<PluginListPage result={result} query={query} flash={flash} isLoggedIn={isLoggedIn} />);
  });

  // 插件详情（公开浏览，删除操作由 requireAuth 保护）
  web.get("/web/plugins/:pluginId", (c) => {
    const pluginId = c.req.param("pluginId");
    const plugin = service.getPlugin(pluginId);
    if (!plugin) {
      return c.html(<PluginNotFoundPage pluginId={pluginId} />, 404);
    }
    const flash = getFlash(c);
    const isLoggedIn = c.get("isLoggedIn");
    return c.html(
      <PluginDetailPage plugin={plugin} baseUrl={config.baseUrl} flash={flash} isLoggedIn={isLoggedIn} />
    );
  });

  // 上传页面（需登录）
  web.get("/web/upload", requireAuth, (c) => {
    const flash = getFlash(c);
    return c.html(
      <UploadPage maxFileSize={config.maxFileSize} flash={flash} />
    );
  });

  // 上传处理（需登录，由 requireAuth 中间件统一保护）
  web.post("/web/upload", requireAuth, async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"] as File;
    const force = body["force"] === "on";

    // 文件校验
    if (!file || file.size === 0) {
      return c.html(
        <UploadPage error="Please select a file" maxFileSize={config.maxFileSize} flash={null} />,
        400
      );
    }

    if (file.size > config.maxFileSize) {
      const maxMb = Math.round(config.maxFileSize / 1024 / 1024);
      return c.html(
        <UploadPage
          error={`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${maxMb} MB`}
          maxFileSize={config.maxFileSize}
          flash={null}
        />,
        400
      );
    }

    try {
      const result = await service.upload(file, force);
      return c.redirect(
        redirectWithFlash(
          `/web/plugins/${result.pluginId}`,
          "success",
          `v${result.version} uploaded successfully`
        )
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      return c.html(
        <UploadPage error={msg} maxFileSize={config.maxFileSize} flash={null} />,
        400
      );
    }
  });

  // 删除版本（需登录）
  web.post("/web/plugins/:pluginId/:version/delete", requireAuth, async (c) => {
    const { pluginId, version } = c.req.param();

    try {
      await service.deleteVersion(pluginId, version);
      return c.redirect(
        redirectWithFlash(
          `/web/plugins/${pluginId}`,
          "success",
          `v${version} deleted`
        )
      );
    } catch (e) {
      return c.redirect(
        redirectWithFlash(
          `/web/plugins/${pluginId}`,
          "error",
          e instanceof Error ? e.message : "Delete failed"
        )
      );
    }
  });

  // 删除整个插件（需登录）
  web.post("/web/plugins/:pluginId/delete", requireAuth, async (c) => {
    const pluginId = c.req.param("pluginId");

    try {
      await service.deletePlugin(pluginId);
      return c.redirect(
        redirectWithFlash("/", "success", `${pluginId} and all versions deleted`)
      );
    } catch (e) {
      return c.redirect(
        redirectWithFlash(
          `/web/plugins/${pluginId}`,
          "error",
          e instanceof Error ? e.message : "Delete failed"
        )
      );
    }
  });

  // 统计（公开）
  web.get("/web/stats", (c) => {
    const stats = service.getStats();
    const recentUploads = service.getRecentUploads(10);
    return c.html(
      <StatsPage
        stats={stats}
        uptime={service.getUptime()}
        dbType={config.db.type}
        startTime={service.getStartTime()}
        recentUploads={recentUploads}
      />
    );
  });

  return web;
}
