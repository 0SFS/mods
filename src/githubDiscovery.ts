import type { ModKind } from "./schema";

export interface GithubModRepository {
  fullName: string;
  description: string;
  stars: number;
  topics: readonly string[];
  url: string;
}

export type ModBrowseKind = "all" | ModKind;

const TOPIC: Record<ModBrowseKind, string> = {
  all: "topic:0sfs-mod",
  aircraft: "topic:0sfs-mod topic:0sfs-aircraft",
  engine: "topic:0sfs-mod topic:0sfs-engine",
  component: "topic:0sfs-mod topic:0sfs-component",
  payload: "topic:0sfs-mod topic:0sfs-payload",
  plugin: "topic:0sfs-mod topic:0sfs-plugin",
  modpack: "topic:0sfs-mod topic:0sfs-modpack",
};

const TEN_MINUTES_MS = 10 * 60 * 1000;

interface CacheEntry { at: number; etag: string | null; repositories: GithubModRepository[] }

export interface DiscoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function cacheKey(kind: ModBrowseKind): string {
  return `osfs.mods.github.${kind}`;
}

/**
 * Unauthenticated topic search. Results stay in sessionStorage for ten minutes
 * and send the saved ETag so a tab change does not spend the 60-request hour.
 */
export async function browseGithubMods(kind: ModBrowseKind, fetchImpl: typeof fetch = fetch, storage: DiscoveryStorage | null = null, now = Date.now()): Promise<GithubModRepository[]> {
  const key = cacheKey(kind);
  const cached = readCache(storage, key);
  if (cached && now - cached.at < TEN_MINUTES_MS) return cached.repositories;
  const headers = new Headers({ Accept: "application/vnd.github+json" });
  if (cached?.etag) headers.set("If-None-Match", cached.etag);
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(TOPIC[kind])}&sort=stars&order=desc&per_page=30`;
  const response = await fetchImpl(url, { headers });
  if (response.status === 304 && cached) {
    writeCache(storage, key, { ...cached, at: now });
    return cached.repositories;
  }
  if (!response.ok) {
    if (cached) return cached.repositories;
    throw new Error(`GitHub mod search failed (${response.status}).`);
  }
  const payload: unknown = await response.json();
  const items = payload && typeof payload === "object" && "items" in payload && Array.isArray(payload.items) ? payload.items : [];
  const repositories = items.flatMap((item): GithubModRepository[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as { full_name?: unknown; description?: unknown; stargazers_count?: unknown; topics?: unknown; html_url?: unknown };
    if (typeof record.full_name !== "string" || typeof record.html_url !== "string") return [];
    return [{
      fullName: record.full_name,
      description: typeof record.description === "string" ? record.description : "",
      stars: typeof record.stargazers_count === "number" ? record.stargazers_count : 0,
      topics: Array.isArray(record.topics) ? record.topics.filter((topic): topic is string => typeof topic === "string") : [],
      url: record.html_url,
    }];
  });
  writeCache(storage, key, { at: now, etag: response.headers.get("etag"), repositories });
  return repositories;
}

function readCache(storage: DiscoveryStorage | null, key: string): CacheEntry | null {
  const raw = storage?.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof value.at !== "number" || !Array.isArray(value.repositories)) return null;
    return { at: value.at, etag: typeof value.etag === "string" ? value.etag : null, repositories: value.repositories };
  } catch {
    return null;
  }
}

function writeCache(storage: DiscoveryStorage | null, key: string, entry: CacheEntry): void {
  storage?.setItem(key, JSON.stringify(entry));
}
