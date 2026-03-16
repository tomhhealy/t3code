export const DEFAULT_WORKTREE_BRANCH_PREFIX = "t3code";
export const DEFAULT_FEATURE_BRANCH_PREFIX = "feature";
export const DEFAULT_WORKTREE_ROOT_NAME = "worktrees";

/**
 * Sanitize an arbitrary string into a valid, lowercase git branch fragment.
 * Strips quotes, collapses separators, limits to 64 chars.
 */
export function sanitizeBranchFragment(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/^[./\s_-]+|[./\s_-]+$/g, "");

  const branchFragment = normalized
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[./_-]+|[./_-]+$/g, "")
    .slice(0, 64)
    .replace(/[./_-]+$/g, "");

  return branchFragment.length > 0 ? branchFragment : "update";
}

export function normalizeGitNamingSegment(
  raw: string | null | undefined,
  fallback: string,
): string {
  const normalized = sanitizeBranchFragment(raw ?? "").replace(/\//g, "-");
  return normalized.length > 0 ? normalized : fallback;
}

/**
 * Sanitize a string into a `${prefix}/…` branch name.
 * Preserves an existing `${prefix}/` prefix or slash-separated namespace.
 */
export function sanitizeFeatureBranchName(
  raw: string,
  prefix = DEFAULT_FEATURE_BRANCH_PREFIX,
): string {
  const sanitized = sanitizeBranchFragment(raw);
  const normalizedPrefix = normalizeGitNamingSegment(prefix, DEFAULT_FEATURE_BRANCH_PREFIX);
  if (sanitized.includes("/")) {
    return sanitized.startsWith(`${normalizedPrefix}/`)
      ? sanitized
      : `${normalizedPrefix}/${sanitized}`;
  }
  return `${normalizedPrefix}/${sanitized}`;
}

/**
 * Resolve a unique `${prefix}/…` branch name that doesn't collide with
 * any existing branch. Appends a numeric suffix when needed.
 */
export function resolveAutoFeatureBranchName(
  existingBranchNames: readonly string[],
  preferredBranch?: string,
  prefix = DEFAULT_FEATURE_BRANCH_PREFIX,
): string {
  const preferred = preferredBranch?.trim();
  const normalizedPrefix = normalizeGitNamingSegment(prefix, DEFAULT_FEATURE_BRANCH_PREFIX);
  const autoFeatureBranchFallback = `${normalizedPrefix}/update`;
  const resolvedBase = sanitizeFeatureBranchName(
    preferred && preferred.length > 0 ? preferred : autoFeatureBranchFallback,
    normalizedPrefix,
  );
  const existingNames = new Set(existingBranchNames.map((branch) => branch.toLowerCase()));

  if (!existingNames.has(resolvedBase)) {
    return resolvedBase;
  }

  let suffix = 2;
  while (existingNames.has(`${resolvedBase}-${suffix}`)) {
    suffix += 1;
  }

  return `${resolvedBase}-${suffix}`;
}

export function buildTemporaryWorktreeBranchName(
  token: string,
  prefix = DEFAULT_WORKTREE_BRANCH_PREFIX,
): string {
  return `${normalizeGitNamingSegment(prefix, DEFAULT_WORKTREE_BRANCH_PREFIX)}/${sanitizeBranchFragment(token)}`;
}
