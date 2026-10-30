import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryStorage } from "../src/githubDiscovery";

let discovery: typeof import("../src/githubDiscovery");

function response(fullName = "0SFS/AIM-120", headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify({ items: [{ full_name: fullName, description: "a mod", stargazers_count: 3, topics: ["0sfs-mod"], html_url: `https://github.com/${fullName}` }] }), {
    status: 200, headers: { "content-type": "application/json", ...headers },
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T00:00:00Z"));
  discovery = await import("../src/githubDiscovery");
});
afterEach(() => { vi.useRealTimers(); });

describe("GitHub mod discovery", () => {
  it("caches topic browse and revalidates with the saved ETag", async () => {
    const storage = new Map<string, string>();
    const bag = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      if (new Headers(init?.headers).get("If-None-Match") === '"mods"') return new Response(null, { status: 304 });
      return response("0SFS/AIM-120", { etag: '"mods"' });
    });
    const first = await discovery.browseGithubMods("payload", fetchImpl, bag, 1_000);
    expect(first[0]?.fullName).toBe("0SFS/AIM-120");
    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get("q")).toBe("topic:0sfs-mod topic:0sfs-payload-mod fork:true template:false");
    expect(url.searchParams.get("sort")).toBe("stars");
    expect(await discovery.browseGithubMods("payload", fetchImpl, bag, 61_000)).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await discovery.browseGithubMods("payload", fetchImpl, bag, 661_000)).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("separates query and kind caches while normalizing case and spacing", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    await discovery.searchGithubMods(" Camera   Gimbal ", "component", { fetchImpl });
    await discovery.searchGithubMods("camera gimbal", "component", { fetchImpl });
    await discovery.searchGithubMods("camera", "component", { fetchImpl });
    await discovery.searchGithubMods("camera", "plugin", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get("q")).toBe('topic:0sfs-mod topic:0sfs-component-mod fork:true template:false "camera" "gimbal" in:name,description');
    expect(url.searchParams.has("sort")).toBe(false);
    expect(url.searchParams.get("per_page")).toBe("30");
    expect(new Headers(fetchImpl.mock.calls[0]![1]?.headers).has("Authorization")).toBe(false);
  });

  it.each(["0SFS/DJI-Mini2@v1", "https://github.com/0SFS/DJI-Mini2/tree/v1", "https://0sfs.github.io/DJI-Mini2/"])("recognizes exact GitHub source %s", async source => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    await discovery.searchGithubMods(source, "aircraft", { fetchImpl });
    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get("q")).toContain("repo:0sfs/dji-mini2");
    expect(url.searchParams.get("q")).toContain("topic:0sfs-aircraft-mod");
  });

  it("treats qualifiers and operators in free text as literal words", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    await discovery.searchGithubMods('camera OR topic:unrelated -topic:0sfs-mod', "component", { fetchImpl });
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).searchParams.get("q")).toBe('topic:0sfs-mod topic:0sfs-component-mod fork:true template:false "camera" "or" "topic" "unrelated" "-topic" "0sfs-mod" in:name,description');
  });

  it("keeps search and memory caching usable when session storage throws", async () => {
    const bag: DiscoveryStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    expect(await discovery.searchGithubMods("AIM", "payload", { fetchImpl, storage: bag })).toHaveLength(1);
    await discovery.searchGithubMods("AIM", "payload", { fetchImpl, storage: bag });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed cached repositories", async () => {
    const bag: DiscoveryStorage = { getItem: () => JSON.stringify({ at: Date.now(), repositories: [null] }), setItem: () => {} };
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    expect(await discovery.searchGithubMods("camera", "component", { fetchImpl, storage: bag })).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("shares the ten-search budget, aborting obsolete queued searches without spending it", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response());
    for (let index = 0; index < 10; index++) await discovery.searchGithubMods(`mod${index}`, "all", { fetchImpl });
    const controller = new AbortController();
    const onWait = vi.fn();
    const obsolete = discovery.searchGithubMods("obsolete", "all", { fetchImpl, signal: controller.signal, onWait });
    const rejection = expect(obsolete).rejects.toMatchObject({ name: "AbortError" });
    expect(onWait).toHaveBeenCalledWith(Date.now() + 60_000);
    controller.abort();
    await rejection;
    const latestWait = vi.fn();
    const latest = discovery.searchGithubMods("latest", "aircraft", { fetchImpl, onWait: latestWait });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(1);
    expect(await latest).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(11);
    expect(latestWait).toHaveBeenLastCalledWith(null);
    expect(String(fetchImpl.mock.calls[10]![0])).toContain("latest");
  });

  it.each([
    [429, { "retry-after": "12" }, 12_000],
    [403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1793232015" }, 15_000],
  ] as const)("honors server cooldown for HTTP %s and retries once", async (status, headers, delay) => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status, headers }))
      .mockResolvedValueOnce(response());
    const onWait = vi.fn();
    const pending = discovery.searchGithubMods("drone", "aircraft", { fetchImpl, onWait });
    await vi.advanceTimersByTimeAsync(0);
    expect(onWait).toHaveBeenCalledWith(Date.now() + delay);
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onWait).toHaveBeenLastCalledWith(null);
  });

  it("honors an exhausted server budget reported with a successful search", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response("0SFS/AIM-120", { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Date.now() / 1000 + 20) }))
      .mockResolvedValueOnce(response());
    await discovery.searchGithubMods("missile", "payload", { fetchImpl });
    const onWait = vi.fn();
    const pending = discovery.searchGithubMods("camera", "component", { fetchImpl, onWait });
    expect(onWait).toHaveBeenCalledWith(Date.now() + 20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry indefinitely when GitHub keeps rejecting searches", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 429, headers: { "retry-after": "1" } }));
    const pending = discovery.searchGithubMods("drone", "aircraft", { fetchImpl });
    const rejection = expect(pending).rejects.toThrow("rate limited");
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
