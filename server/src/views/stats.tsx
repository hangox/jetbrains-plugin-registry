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
