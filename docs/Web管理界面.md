# Web 管理界面设计

## 1. 概述

使用 Hono 内置 JSX 服务端渲染。所有页面为 `.tsx` 文件，`c.html()` 直接返回。CSS 使用 Pico.css（classless CSS 框架，~10KB CDN），零构建工具链。

**设计原则：**

- 登录页面使用 JavaScript 处理表单提交，其余页面以标准 HTML form 为主
- JSX 组件化，复用布局和通用元素
- 所有写操作通过标准 HTML form 提交
- 操作结果通过 URL query 参数传递（flash message 模式）
- 移动端自适应（Pico.css 内置响应式）

## 2. 页面清单

| 路径 | 页面 | 功能 | 认证 |
|------|------|------|------|
| `GET /` | 插件列表（首页） | 查看所有插件、搜索、分页 | 否 |
| `GET /web/login` | 登录页面 | 未登录时重定向到此页面 | 否 |
| `POST /web/login` | 登录处理 | 校验账号密码，设置 session cookie | 否 |
| `POST /web/logout` | 登出处理 | 清除 session cookie，重定向到登录页 | 是（Session） |
| `GET /web/plugins/:pluginId` | 插件详情 | 所有版本、元数据、删除操作 | 否（删除操作需登录） |
| `GET /web/upload` | 上传页面 | 手动上传插件 ZIP/JAR | 是（Session） |
| `POST /web/upload` | 上传处理 | form 提交，成功重定向到详情页 | 是（Session） |
| `POST /web/plugins/:pluginId/delete` | 删除插件 | 删除后重定向到首页 | 是（Session） |
| `POST /web/plugins/:pluginId/:version/delete` | 删除版本 | 删除后重定向到详情页 | 是（Session） |
| `GET /web/stats` | 统计页面 | 存储用量、服务信息、最近上传 | 否 |

## 3. 通用组件

### 3.1 布局组件

```tsx
// src/views/layout.tsx
import type { FC, PropsWithChildren } from "hono/jsx";

interface LayoutProps {
  title: string;
  /** 页面级 flash 消息 */
  flash?: { type: "success" | "error"; message: string } | null;
  /** 是否已登录，控制导航项显示 */
  isLoggedIn?: boolean;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title, flash, isLoggedIn = false, children,
}) => (
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} - Plugin Registry</title>
      <link rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" />
      <style>{`
        .meta { color: var(--pico-muted-color); font-size: 0.875rem; }
        .badge {
          display: inline-block; padding: 2px 8px; border-radius: 4px;
          font-size: 0.75rem; background: var(--pico-primary-background);
          color: var(--pico-primary-inverse); margin-left: 0.5rem;
        }
        .danger-zone {
          border: 1px solid var(--pico-del-color); padding: 1rem;
          border-radius: 8px; margin-top: 2rem;
        }
        .flash {
          padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem;
        }
        .flash-success {
          background: var(--pico-ins-color); color: var(--pico-contrast);
          border: 1px solid var(--pico-ins-color);
        }
        .flash-error {
          background: var(--pico-del-color); color: var(--pico-contrast);
          border: 1px solid var(--pico-del-color);
        }
        .empty-state {
          text-align: center; padding: 3rem 1rem;
          color: var(--pico-muted-color);
        }
        .empty-state p { font-size: 1.1rem; }
        .version-table td, .version-table th { white-space: nowrap; }
        .plugin-card { cursor: pointer; transition: border-color 0.2s; }
        .plugin-card:hover {
          border-color: var(--pico-primary);
        }
        code.repo-url {
          display: block; padding: 0.5rem; background: var(--pico-code-background);
          border-radius: 4px; word-break: break-all; user-select: all;
          font-size: 0.85rem;
        }
        .stats-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }
        .stat-card { text-align: center; }
        .stat-card .value { font-size: 2rem; font-weight: bold; margin: 0; }
        @media (max-width: 576px) {
          .version-table { font-size: 0.8rem; }
          .stats-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </head>
    <body>
      <header class="container">
        <nav>
          <ul><li><strong><a href="/">Plugin Registry</a></strong></li></ul>
          <ul>
            <li><a href="/">Plugins</a></li>
            {isLoggedIn && <li><a href="/web/upload">Upload</a></li>}
            <li><a href="/web/stats">Stats</a></li>
            {isLoggedIn ? (
              <li>
                <form action="/web/logout" method="post" style="display:inline;margin:0">
                  <button type="submit" class="outline secondary" style="padding:4px 12px;margin:0">
                    Logout
                  </button>
                </form>
              </li>
            ) : (
              <li><a href="/web/login">Login</a></li>
            )}
          </ul>
        </nav>
      </header>
      <main class="container">
        {flash && (
          <div class={`flash flash-${flash.type}`} role="alert">
            {flash.message}
          </div>
        )}
        {children}
      </main>
      <footer class="container">
        <small>JetBrains Private Plugin Registry</small>
      </footer>
    </body>
  </html>
);
```

### 3.2 Flash Message 辅助函数

操作结果通过 URL query 参数传递，避免需要 session：

```typescript
// src/lib/flash.ts
import type { Context } from "hono";

export type FlashMessage = { type: "success" | "error"; message: string } | null;

/** 从 URL query 解析 flash 消息 */
export function getFlash(c: Context): FlashMessage {
  const success = c.req.query("success");
  if (success) return { type: "success", message: decodeURIComponent(success) };

  const error = c.req.query("error");
  if (error) return { type: "error", message: decodeURIComponent(error) };

  return null;
}

/** 构建重定向 URL，附带 flash 参数 */
export function redirectWithFlash(
  basePath: string,
  type: "success" | "error",
  message: string,
): string {
  return `${basePath}?${type}=${encodeURIComponent(message)}`;
}
```

使用示例：

```typescript
// 上传成功后重定向
return c.redirect(
  redirectWithFlash(`/web/plugins/${result.pluginId}`, "success", `v${result.version} 上传成功`)
);

// 删除后重定向
return c.redirect(
  redirectWithFlash("/", "success", `${pluginId} 已删除`)
);
```

## 4. 插件列表页（首页）

### 4.1 线框图

```
┌──────────────────────────────────────────────────────────────┐
│  Plugin Registry                    [Plugins] [Upload] [Stats] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ 搜索 ─────────────────────────────────────────────────┐  │
│  │ [Search plugins...                        ] [Search]   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  15 plugins registered                                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ My Custom Plugin                          v1.2.0       │  │
│  │ com.example.myplugin · Example Inc · 3 versions       │  │
│  │ Updated: 2026-02-21                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Another Plugin                            v2.0.0       │  │
│  │ com.example.another · My Team · 1 version             │  │
│  │ Updated: 2026-02-20                                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [< Prev]  Page 1 of 2  [Next >]                            │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 空状态

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              还没有插件                                       │
│              上传第一个插件开始使用吧                           │
│                                                              │
│              [Upload Plugin]                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 搜索无结果

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  [Search plugins: "nonexistent"      ] [Search]              │
│                                                              │
│              没有找到匹配 "nonexistent" 的插件                  │
│              [清除搜索]                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 实现

```tsx
// src/views/plugin-list.tsx
import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { PagedResult, PluginSummary } from "../repository/types";
import type { FlashMessage } from "../lib/flash";

export const PluginListPage: FC<{
  result: PagedResult<PluginSummary>;
  query: string | null;
  flash: FlashMessage;
  isLoggedIn?: boolean;
}> = ({ result, query, flash, isLoggedIn }) => (
  <Layout title="Plugins" flash={flash} isLoggedIn={isLoggedIn}>
    <h1>Plugins</h1>

    {/* 搜索栏 */}
    <form action="/" method="get" role="search">
      <fieldset role="group">
        <input type="search" name="query" placeholder="Search by name or ID..."
               value={query ?? ""} aria-label="Search plugins" />
        <button type="submit">Search</button>
      </fieldset>
    </form>

    {/* 空状态 */}
    {result.total === 0 && !query && (
      <div class="empty-state">
        <p>还没有插件</p>
        <p>上传第一个插件开始使用吧</p>
        <a href="/web/upload" role="button">Upload Plugin</a>
      </div>
    )}

    {/* 搜索无结果 */}
    {result.total === 0 && query && (
      <div class="empty-state">
        <p>没有找到匹配 "{query}" 的插件</p>
        <a href="/">清除搜索</a>
      </div>
    )}

    {/* 有结果 */}
    {result.total > 0 && (
      <>
        <p class="meta">{result.total} plugins registered</p>

        {result.items.map((plugin) => (
          <article class="plugin-card">
            <header>
              <a href={`/web/plugins/${plugin.id}`}>
                <strong>{plugin.name}</strong>
              </a>
              <span class="badge">v{plugin.latestVersion}</span>
            </header>
            <p class="meta">
              {plugin.id}
              {plugin.vendor && ` · ${plugin.vendor}`}
              {` · ${plugin.versionCount} version(s)`}
            </p>
            <footer class="meta">
              Updated: {plugin.updatedAt.split("T")[0]}
            </footer>
          </article>
        ))}

        {/* 分页 */}
        {result.total > result.pageSize && (
          <nav aria-label="Pagination">
            {result.page > 1 ? (
              <a href={`/?page=${result.page - 1}${query ? `&query=${query}` : ""}`}>
                &lt; Prev
              </a>
            ) : (
              <span class="meta">&lt; Prev</span>
            )}
            {" "}Page {result.page} of {Math.ceil(result.total / result.pageSize)}{" "}
            {result.page * result.pageSize < result.total ? (
              <a href={`/?page=${result.page + 1}${query ? `&query=${query}` : ""}`}>
                Next &gt;
              </a>
            ) : (
              <span class="meta">Next &gt;</span>
            )}
          </nav>
        )}
      </>
    )}
  </Layout>
);
```

## 5. 插件详情页

### 5.1 线框图

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to list                                              │
│                                                              │
│  ┌─ 成功提示 ──────────────────────────────────────────────┐ │
│  │ v1.2.0 上传成功                                         │ │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  My Custom Plugin                                            │
│  com.example.myplugin                                        │
│  Vendor: Example Inc (dev@example.com)                       │
│                                                              │
│  ┌─ Description ──────────────────────────────────────────┐  │
│  │ ▶ 点击展开描述                                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  IDE Repository URL:                                         │
│  https://plugins.example.com/updatePlugins.xml               │
│                                                              │
│  Dependencies:                                               │
│  com.intellij.modules.platform, org.jetbrains.plugins.yaml   │
│                                                              │
│  Versions (3)                                                │
│  ┌──────┬──────────────┬────────┬────────────┬────────┐      │
│  │ Ver  │ Compatibility│ Size   │ Uploaded   │ Action │      │
│  ├──────┼──────────────┼────────┼────────────┼────────┤      │
│  │1.2.0 │ 222 → 241.*  │ 1.3 MB │ 2026-02-21│[Delete]│      │
│  │1.1.0 │ 222 → 232.*  │ 1.2 MB │ 2026-02-15│[Delete]│      │
│  │1.0.0 │ 222 → 231.*  │ 1.1 MB │ 2026-02-10│[Delete]│      │
│  └──────┴──────────────┴────────┴────────────┴────────┘      │
│                                                              │
│  ┌─ Change Notes (v1.2.0) ────────────────────────────────┐  │
│  │ - 修复了 Bug                                            │  │
│  │ - 新增 xxx 功能                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Danger Zone ─────────────────────────────────────────┐   │
│  │ Delete this plugin and all versions                   │   │
│  │ [Delete Plugin]                                       │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 插件不存在（404）

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to list                                              │
│                                                              │
│              插件不存在                                       │
│              ID: com.example.nonexistent                     │
│                                                              │
│              [Back to Plugins]                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 实现

```tsx
// src/views/plugin-detail.tsx
import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { PluginWithVersions } from "../repository/types";
import type { FlashMessage } from "../lib/flash";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * HTML 内容安全转义（防 XSS）
 *
 * 注意：这是一个简易实现，适用于内网私有仓库场景。
 * 不处理 <object>、<embed>、<svg onload> 等高级向量。
 * 如需更严格的防护，建议替换为 DOMPurify 或 sanitize-html 库。
 */
const sanitizeHtml = (html: string): string => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "");
};

export const PluginDetailPage: FC<{
  plugin: PluginWithVersions;
  baseUrl: string;
  flash: FlashMessage;
  isLoggedIn?: boolean;
}> = ({ plugin, baseUrl, flash, isLoggedIn }) => (
  <Layout title={plugin.info.name} flash={flash} isLoggedIn={isLoggedIn}>
    <p><a href="/">&lt; Back to list</a></p>

    {/* 插件基本信息 */}
    <hgroup>
      <h1>{plugin.info.name}</h1>
      <p>{plugin.info.id}</p>
    </hgroup>

    {plugin.info.vendor && (
      <p>
        Vendor: {plugin.info.vendor.name}
        {plugin.info.vendor.email && (
          <> (<a href={`mailto:${plugin.info.vendor.email}`}>{plugin.info.vendor.email}</a>)</>
        )}
        {plugin.info.vendor.url && (
          <> · <a href={plugin.info.vendor.url} target="_blank" rel="noopener">Website</a></>
        )}
      </p>
    )}

    {/* 描述（可折叠） */}
    {plugin.info.description && (
      <details>
        <summary>Description</summary>
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(plugin.info.description) }} />
      </details>
    )}

    {/* IDE 仓库地址 */}
    <div>
      <p class="meta">IDE Repository URL (add this in IDE Settings → Plugins → Manage Repositories):</p>
      <code class="repo-url">{baseUrl}/updatePlugins.xml</code>
    </div>

    {/* 依赖 */}
    {plugin.versions[0]?.depends && plugin.versions[0].depends.length > 0 && (
      <p class="meta">
        Dependencies: {plugin.versions[0].depends.join(", ")}
      </p>
    )}

    {/* 版本表格 */}
    <h2>Versions ({plugin.versions.length})</h2>

    {plugin.versions.length === 0 ? (
      <div class="empty-state">
        <p>No versions available</p>
      </div>
    ) : (
      <div style="overflow-x:auto">
        <table role="grid" class="version-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Compatibility</th>
              <th>Size</th>
              <th>SHA-256</th>
              <th>Uploaded</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {plugin.versions.map((ver) => (
              <tr>
                <td><strong>v{ver.version}</strong></td>
                <td>{ver.sinceBuild}{ver.untilBuild ? ` → ${ver.untilBuild}` : "+"}</td>
                <td>{formatSize(ver.fileSize)}</td>
                <td><code title={ver.fileSha256}>{ver.fileSha256.substring(0, 8)}...</code></td>
                <td>{ver.createdAt.split("T")[0]}</td>
                <td>
                  <form action={`/web/plugins/${plugin.info.id}/${ver.version}/delete`}
                        method="post" style="display:inline">
                    <button type="submit" class="secondary outline"
                            onclick={`return confirm('Delete v${ver.version}?\\nThis action cannot be undone.')`}>
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {/* 最新版本 Change Notes */}
    {plugin.versions[0]?.changeNotes && (
      <details open>
        <summary>Change Notes (v{plugin.versions[0].version})</summary>
        <div dangerouslySetInnerHTML={{
          __html: sanitizeHtml(plugin.versions[0].changeNotes)
        }} />
      </details>
    )}

    {/* Danger Zone */}
    <div class="danger-zone">
      <p><strong>Danger Zone</strong></p>
      <p>Delete this plugin and all {plugin.versions.length} version(s). This action cannot be undone.</p>
      <form action={`/web/plugins/${plugin.info.id}/delete`}
            method="post">
        <button type="submit" class="contrast"
                onclick={`return confirm('Delete ${plugin.info.name} and ALL ${plugin.versions.length} versions?\\nThis action cannot be undone.')`}>
          Delete Plugin
        </button>
      </form>
    </div>

  </Layout>
);
```

### 5.4 404 页面组件

```tsx
// src/views/not-found.tsx
import type { FC } from "hono/jsx";
import { Layout } from "./layout";

export const PluginNotFoundPage: FC<{ pluginId: string }> = ({ pluginId }) => (
  <Layout title="Not Found">
    <div class="empty-state">
      <h1>插件不存在</h1>
      <p>ID: <code>{pluginId}</code></p>
      <a href="/" role="button">Back to Plugins</a>
    </div>
  </Layout>
);
```

## 6. 上传页面

### 6.1 线框图

```
┌──────────────────────────────────────────────────────────────┐
│  Upload Plugin                                               │
│                                                              │
│  ┌─ 错误提示（红色背景） ─────────────────────────────────┐   │
│  │ Invalid plugin package: no plugin.xml found              │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                              │
│  Plugin File (.zip or .jar)                                  │
│  [Choose file...                                     ]       │
│  Accepted: .zip, .jar — Max size: 100 MB                     │
│                                                              │
│  [✓] Overwrite if version exists                             │
│                                                              │
│  [Upload]                                                    │
│                                                              │
│  ─────────────────────────────────────────────────────────   │
│                                                              │
│  Or use Gradle (recommended):                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ PLUGIN_REGISTRY_TOKEN=xxx ./gradlew uploadPlugin      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  See Gradle Plugin documentation for setup instructions.     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 实现

```tsx
// src/views/upload.tsx
import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { FlashMessage } from "../lib/flash";

export const UploadPage: FC<{
  error?: string;
  maxFileSize: number;
  flash: FlashMessage;
}> = ({ error, maxFileSize, flash }) => (
  <Layout title="Upload" flash={flash}>
    <h1>Upload Plugin</h1>

    {/* 表单级错误（区别于 flash 消息） */}
    {error && (
      <div class="flash flash-error" role="alert">
        {error}
      </div>
    )}

    <form action="/web/upload" method="post" enctype="multipart/form-data">
      <label>
        Plugin File (.zip or .jar)
        <input type="file" name="file" accept=".zip,.jar" required
               aria-describedby="file-hint" />
        <small id="file-hint">
          Accepted: .zip, .jar — Max size: {Math.round(maxFileSize / 1024 / 1024)} MB
        </small>
      </label>

      <label>
        <input type="checkbox" name="force" role="switch" />
        Overwrite if version exists
      </label>

      <button type="submit">Upload</button>
    </form>

    <hr />

    <h3>Or use Gradle (recommended)</h3>
    <pre><code>{`PLUGIN_REGISTRY_TOKEN=xxx ./gradlew uploadPlugin`}</code></pre>
    <p class="meta">
      See <a href="https://github.com/example/private-plugin-registry" target="_blank">
      Gradle Plugin documentation</a> for setup instructions.
    </p>
  </Layout>
);
```

## 7. 统计页面

### 7.1 线框图

```
┌──────────────────────────────────────────────────────────────┐
│  Registry Statistics                                         │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Plugins  │  │ Versions │  │ Storage  │                   │
│  │    15    │  │    42    │  │ 500 MB   │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
│                                                              │
│  Service Info                                                │
│  ┌────────────┬────────────────────────────────────┐         │
│  │ Uptime     │ 3d 12h 30m                         │         │
│  │ Database   │ SQLite                             │         │
│  │ Runtime    │ Bun 1.2.0                          │         │
│  │ Start Time │ 2026-02-18 10:00:00                │         │
│  └────────────┴────────────────────────────────────┘         │
│                                                              │
│  Recent Uploads                                              │
│  ┌────────────────────────────┬──────────┬──────────────┐    │
│  │ Plugin                     │ Version  │ Uploaded     │    │
│  ├────────────────────────────┼──────────┼──────────────┤    │
│  │ com.example.myplugin       │ 1.2.0    │ 2026-02-21  │    │
│  │ com.example.another        │ 2.0.0    │ 2026-02-20  │    │
│  └────────────────────────────┴──────────┴──────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 实现

```tsx
// src/views/stats.tsx
import type { FC } from "hono/jsx";
import { Layout } from "./layout";
import type { RegistryStats, RecentUpload } from "../repository/types";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export const StatsPage: FC<{
  stats: RegistryStats;
  uptime: string;
  dbType: string;
  startTime: string;
  recentUploads: RecentUpload[];
}> = ({ stats, uptime, dbType, startTime, recentUploads }) => (
  <Layout title="Stats">
    <h1>Registry Statistics</h1>

    {/* 数字卡片 */}
    <div class="stats-grid">
      <article class="stat-card">
        <header>Plugins</header>
        <p class="value">{stats.pluginCount}</p>
      </article>
      <article class="stat-card">
        <header>Versions</header>
        <p class="value">{stats.versionCount}</p>
      </article>
      <article class="stat-card">
        <header>Storage</header>
        <p class="value">{formatBytes(stats.totalStorageBytes)}</p>
      </article>
    </div>

    {/* 服务信息 */}
    <h2>Service Info</h2>
    <table>
      <tbody>
        <tr><td>Uptime</td><td>{uptime}</td></tr>
        <tr><td>Database</td><td>{dbType}</td></tr>
        <tr>
          <td>Runtime</td>
          <td>Bun {typeof Bun !== "undefined" ? Bun.version : "?"}</td>
        </tr>
        <tr><td>Start Time</td><td>{startTime}</td></tr>
      </tbody>
    </table>

    {/* 最近上传 */}
    <h2>Recent Uploads</h2>
    {recentUploads.length === 0 ? (
      <div class="empty-state">
        <p>还没有上传记录</p>
      </div>
    ) : (
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Version</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {recentUploads.map((upload) => (
            <tr>
              <td>
                <a href={`/web/plugins/${upload.pluginId}`}>{upload.pluginId}</a>
              </td>
              <td>v{upload.version}</td>
              <td>{upload.createdAt.split("T")[0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </Layout>
);
```

## 8. 路由实现

```typescript
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
```

## 9. Web 认证机制

### 9.1 认证流程图

```
用户访问受保护页面（如 /web/upload）
          │
          ▼
    Session 中间件检查 cookie
          │
    ┌─────┴─────┐
    ▼           ▼
  有效 session  无 session
    │           │
    ▼           ▼
  正常访问     重定向到 /web/login?returnTo=原页面
                │
                ▼
          显示登录表单
                │
                ▼
     用户输入用户名 + 密码
                │
                ▼
     POST /web/login
                │
                ▼
       校验用户名密码
                │
          ┌─────┴─────┐
          ▼           ▼
        正确         错误
          │           │
          ▼           ▼
    设置 httpOnly    重定向到 /web/login
    cookie           附带 ?error=xxx
          │
          ▼
    重定向回 returnTo 页面
```

### 9.2 登录页面组件

```tsx
// src/views/login.tsx
import type { FC } from "hono/jsx";
import { Layout } from "./layout";

export const LoginPage: FC<{
  error: string | null;
  returnTo: string;
}> = ({ error, returnTo }) => (
  <Layout title="Login">
    <h1>Login</h1>

    {error && (
      <div class="flash flash-error" role="alert">
        {error}
      </div>
    )}

    <form action="/web/login" method="post">
      <input type="hidden" name="returnTo" value={returnTo} />

      <label>
        Username
        <input type="text" name="username" required autofocus
               autocomplete="username" placeholder="admin" />
      </label>

      <label>
        Password
        <input type="password" name="password" required
               autocomplete="current-password" placeholder="Enter password" />
      </label>

      <button type="submit">Login</button>
    </form>
  </Layout>
);
```

### 9.3 Session 中间件

使用 Hono 内置的 cookie helper，通过签名 cookie 存储登录态：

```typescript
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

// Session 中间件：解析 cookie，注入登录状态
web.use("*", async (c, next) => {
  const sessionToken = getCookie(c, "session");
  c.set("isLoggedIn", sessionToken === config.sessionSecret);
  await next();
});

// requireAuth 中间件：保护需要登录的路由
const requireAuth = async (c, next) => {
  if (!c.get("isLoggedIn")) {
    const returnTo = encodeURIComponent(c.req.path);
    return c.redirect(`/web/login?returnTo=${returnTo}`);
  }
  await next();
};
```

Cookie 配置：
- `httpOnly: true` — JavaScript 无法读取，防 XSS 窃取
- `sameSite: "Strict"` — 阻止跨站请求携带 cookie，防 CSRF
- `path: "/"` — 全站有效
- `maxAge: 7 * 24 * 60 * 60` — 7 天有效期

### 9.4 认证失败处理

未登录用户访问受保护页面时：

1. `requireAuth` 中间件检测到无有效 session
2. 自动重定向到 `/web/login?returnTo=<原始路径>`
3. 用户登录成功后自动跳转回原页面

登录失败时：
- 重定向到 `/web/login?error=Invalid+username+or+password`
- 登录页显示错误提示

### 9.5 与 API Token 的区别

| 维度 | Web Session 认证 | API Token 认证 |
|------|-----------------|----------------|
| 使用场景 | 浏览器管理界面 | Gradle 插件 / CI / 脚本 |
| 认证方式 | 用户名密码 → httpOnly cookie | `Authorization: Bearer <token>` |
| 配置项 | `ADMIN_USER` + `ADMIN_PASS` | `AUTH_TOKENS` |
| 有效期 | 7 天（cookie maxAge） | 永久（直到 Token 变更） |
| 多用户 | 单管理员 | 支持多 Token |
| 传输方式 | Cookie 自动携带 | 请求头手动传递 |

## 10. 安全考虑

### 10.1 XSS 防护

`plugin.xml` 中的 `description` 和 `change-notes` 可能包含 HTML：

```xml
<description><![CDATA[
  <h2>My Plugin</h2>
  <p>A great plugin for <b>IntelliJ IDEA</b>.</p>
]]></description>
```

处理方式：
1. 存储原始 HTML（JetBrains IDE 需要原始 HTML 渲染）
2. Web UI 渲染前用 `sanitizeHtml()` 过滤危险标签
3. 移除 `<script>`、`<iframe>`、`on*` 事件处理器
4. 保留安全的格式化标签（`<p>`、`<b>`、`<ul>`、`<li>` 等）

### 10.2 CSRF 防护

Session-based 认证下 cookie 会自动随请求发送，理论上需要防范 CSRF。本项目的策略：

- **`SameSite=Strict` cookie**：浏览器不会在跨站请求中携带此 cookie，阻止绝大多数 CSRF 攻击
- **单管理员 + 内网使用**：攻击面极小
- **所有写操作使用 POST**：不会被 `<img>` 等 GET 请求触发

综合以上因素，不额外引入 CSRF Token 机制。如未来需要增强安全性，可考虑为表单添加 CSRF Token。

### 10.3 响应式设计

Pico.css 内置的响应式断点：

| 断点 | 宽度 | 适配 |
|------|------|------|
| 默认 | < 576px | 手机 |
| `sm` | ≥ 576px | 平板竖屏 |
| `md` | ≥ 768px | 平板横屏 |
| `lg` | ≥ 1024px | 桌面 |

额外处理：
- 版本表格添加 `overflow-x: auto` 支持横向滚动
- 统计卡片用 `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))` 自适应列数
- 小屏幕下表格字号缩小到 0.8rem
