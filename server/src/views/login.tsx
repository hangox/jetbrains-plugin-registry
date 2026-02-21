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
