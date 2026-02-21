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
