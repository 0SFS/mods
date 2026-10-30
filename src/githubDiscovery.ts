import { normalizeModSource } from "./normalizeModSource";
import type { ModKind } from "./schema";

export interface GithubModRepository {
  fullName: string;
  description: string;
  stars: number;
  topics: readonly string[];
  url: string;
}

export type ModBrowseKind = "all" | ModKind;

export interface DiscoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GithubModSearchOptions {
  fetchImpl?: typeof fetch;
  storage?: DiscoveryStorage | null;
  signal?: AbortSignal;
  /** Called while queued for GitHub's search budget, then with null on resuming. */
  onWait?: (until: number | null) => void;
  now?: () => number;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;
const SEARCH_WINDOW_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const memoryCache = new Map<string, CacheEntry>();
let requestTimes: number[] = [];
let blockedUntil = 0;

interface CacheEntry { at: number; etag: string | null; repositories: GithubModRepository[] }

function searchTerms(source: string): string {
  try {
    const normalized = normalizeModSource(source);
    if (normalized.canonicalKey.startsWith("github:") && /^[A-Za-z0-9_.-]+$/.test(normalized.owner) && /^[A-Za-z0-9_.-]+$/.test(normalized.repo)) {
      return `repo:${normalized.owner.toLowerCase()}/${normalized.repo.toLowerCase()}`;
    }
  } catch { /* A search phrase need not be a complete mod source. */ }
  // Treat text as words, not GitHub qualifiers/operators that could widen the search.
  return (source.toLowerCase().match(/[\p{L}\p{N}_.-]+/gu) ?? []).map(word => `"${word}"`).join(" ");
}

function abortIfNeeded(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  abortIfNeeded(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("Search cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function reserveSearch(options: GithubModSearchOptions, now: () => number): Promise<void> {
  let waited = false;
  for (;;) {
    abortIfNeeded(options.signal);
    const at = now();
    requestTimes = requestTimes.filter(time => at - time < SEARCH_WINDOW_MS);
    const until = Math.max(blockedUntil, requestTimes.length >= 10 ? requestTimes[0]! + SEARCH_WINDOW_MS : 0);
    if (until <= at) {
      requestTimes.push(at);
      if (waited) options.onWait?.(null);
      return;
    }
    waited = true;
    options.onWait?.(until);
    await wait(until - at, options.signal);
  }
}

/** Save the server's cooldown even when the response itself is a successful search. */
function recordRateLimit(response: Response, at: number): boolean {
  const retry = response.headers.get("retry-after");
  const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
  const exhausted = response.headers.get("x-ratelimit-remaining") === "0";
  const limited = response.status === 429 || (response.status === 403 && (exhausted || retry !== null));
  let until = exhausted && Number.isFinite(reset) ? reset : 0;
  if (retry !== null) {
    const seconds = Number(retry);
    until = Math.max(until, Number.isFinite(seconds) ? at + seconds * 1000 : Date.parse(retry) || 0);
  }
  if (limited && until <= at) until = at + SEARCH_WINDOW_MS;
  blockedUntil = Math.max(blockedUntil, until);
  return limited;
}

/**
 * Public repository search with one shared ten-request/minute budget. Callers
 * abort superseded queries so only their latest query remains queued.
 */
export async function searchGithubMods(source: string, kind: ModBrowseKind, options: GithubModSearchOptions = {}): Promise<GithubModRepository[]> {
  const now = options.now ?? Date.now;
  const terms = searchTerms(source.trim());
  const key = `osfs.mods.github.v2.${kind}.${encodeURIComponent(terms)}`;
  const cached = readCache(options.storage ?? null, key);
  abortIfNeeded(options.signal);
  if (cached && now() - cached.at < TEN_MINUTES_MS) return cached.repositories;

  const qualifiers = ["topic:0sfs-mod", ...(kind === "all" ? [] : [`topic:0sfs-${kind}-mod`]), "fork:true", "template:false"];
  const query = [...qualifiers, ...(terms ? [terms, "in:name,description"] : [])].join(" ");
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}${terms ? "" : "&sort=stars&order=desc"}&per_page=30`;
  const headers = new Headers({ Accept: "application/vnd.github+json" });
  if (cached?.etag) headers.set("If-None-Match", cached.etag);
  const fetchImpl = options.fetchImpl ?? fetch;
  // A server cooldown can arise from another app sharing this IP. Wait and retry
  // once, never loop indefinitely on rejected requests.
  for (let attempt = 0; attempt < 2; attempt++) {
    await reserveSearch(options, now);
    const response = await fetchImpl(url, { headers, signal: options.signal });
    abortIfNeeded(options.signal);
    const limited = recordRateLimit(response, now());
    if (limited && attempt === 0) continue;
    if (response.status === 304 && cached) {
      writeCache(options.storage ?? null, key, { ...cached, at: now() });
      return cached.repositories;
    }
    if (!response.ok) {
      throw new Error(limited ? "GitHub search is rate limited. Try again shortly." : `GitHub mod search failed (${response.status}).`);
    }
    const payload: unknown = await response.json();
    abortIfNeeded(options.signal);
    if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) {
      throw new Error("GitHub returned an unreadable mod search response.");
    }
    const repositories = payload.items.flatMap(parseRepository);
    writeCache(options.storage ?? null, key, { at: now(), etag: response.headers.get("etag"), repositories });
    return repositories;
  }
  throw new Error("GitHub mod search failed.");
}

/** Compatibility wrapper for callers that only browse a category. */
export function browseGithubMods(kind: ModBrowseKind, fetchImpl: typeof fetch = fetch, storage: DiscoveryStorage | null = null, now = Date.now()): Promise<GithubModRepository[]> {
  const startedAt = Date.now();
  return searchGithubMods("", kind, { fetchImpl, storage, now: () => now + Date.now() - startedAt });
}

function parseRepository(item: unknown): GithubModRepository[] {
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
}

function readCache(storage: DiscoveryStorage | null, key: string): CacheEntry | null {
  const memory = memoryCache.get(key);
  if (memory) return memory;
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof value.at !== "number" || !Array.isArray(value.repositories) || !value.repositories.every(isRepository)) return null;
    return { at: value.at, etag: typeof value.etag === "string" ? value.etag : null, repositories: value.repositories };
  } catch {
    return null;
  }
}

function isRepository(value: unknown): value is GithubModRepository {
  if (!value || typeof value !== "object") return false;
  const repository = value as Partial<GithubModRepository>;
  return typeof repository.fullName === "string" && typeof repository.description === "string"
    && typeof repository.stars === "number" && typeof repository.url === "string"
    && Array.isArray(repository.topics) && repository.topics.every(topic => typeof topic === "string");
}

function writeCache(storage: DiscoveryStorage | null, key: string, entry: CacheEntry): void {
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  if (memoryCache.size > MAX_CACHE_ENTRIES) memoryCache.delete(memoryCache.keys().next().value!);
  try { storage?.setItem(key, JSON.stringify(entry)); } catch { /* Caching is optional. */ }
}
