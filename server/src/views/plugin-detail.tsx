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
