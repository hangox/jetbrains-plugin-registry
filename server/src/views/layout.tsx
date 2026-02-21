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
