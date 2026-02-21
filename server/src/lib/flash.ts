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
