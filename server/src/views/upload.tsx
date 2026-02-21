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
