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
