/**
 * 判断 targetBuild 是否在 [sinceBuild, untilBuild] 范围内。
 *
 * 规则：
 * - 按 "." 分割为段，逐段比较数字
 * - "*" 通配符：该段及后续段全部视为匹配
 * - 段数不同时，缺失的段视为 0
 *
 * 示例：
 *   isCompatible("241.15989", "222", "241.*")  → true
 *   isCompatible("242.10000", "222", "241.*")  → false
 *   isCompatible("241.15989", "222", null)     → true (无上限)
 */
export function isCompatible(
  targetBuild: string,
  sinceBuild: string,
  untilBuild: string | null,
): boolean {
  const target = parseBuild(targetBuild);
  const since = parseBuild(sinceBuild);

  if (compareBuild(target, since) < 0) return false;

  if (untilBuild != null) {
    const until = parseBuild(untilBuild);
    if (compareBuildWithWildcard(target, until) > 0) return false;
  }

  return true;
}

function parseBuild(build: string): string[] {
  return build.split(".");
}

function compareBuild(a: string[], b: string[]): number {
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const aVal = parseInt(a[i] ?? "0", 10) || 0;
    const bVal = parseInt(b[i] ?? "0", 10) || 0;
    if (aVal !== bVal) return aVal - bVal;
  }
  return 0;
}

function compareBuildWithWildcard(target: string[], until: string[]): number {
  for (let i = 0; i < until.length; i++) {
    if (until[i] === "*") return 0; // 通配符，视为匹配
    const targetVal = parseInt(target[i] ?? "0", 10) || 0;
    const untilVal = parseInt(until[i], 10) || 0;
    if (targetVal !== untilVal) return targetVal - untilVal;
  }
  return 0;
}

/**
 * 比较两个版本号（语义化版本），用于排序取最新。
 * "1.2.0" > "1.1.9" > "1.1.0"
 */
export function compareVersions(a: string, b: string): number {
  return compareBuild(parseBuild(a), parseBuild(b));
}
