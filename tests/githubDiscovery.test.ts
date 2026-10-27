import { describe, expect, it } from "vitest";
import { browseGithubMods } from "../src/githubDiscovery";

describe("GitHub topic browse", () => {
  it("caches a topic search and reuses the ETag", async () => {
    const storage = new Map<string, string>();
    const bag = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      urls.push(String(input));
      const headers = new Headers(init?.headers);
      if (headers.get("If-None-Match") === "\"mods\"") return new Response(null, { status: 304 });
      return new Response(JSON.stringify({ items: [{ full_name: "0SFS/AIM-120", description: "missile", stargazers_count: 3, topics: ["0sfs-mod", "0sfs-payload"], html_url: "https://github.com/0SFS/AIM-120" }] }), {
        status: 200,
        headers: { etag: "\"mods\"", "content-type": "application/json" },
      });
    };
    const first = await browseGithubMods("payload", fetchImpl, bag, 1_000);
    expect(first[0]?.fullName).toBe("0SFS/AIM-120");
    expect(urls[0]).toContain("topic%3A0sfs-mod");
    const cached = await browseGithubMods("payload", fetchImpl, bag, 1_000 + 60_000);
    expect(cached).toEqual(first);
    expect(urls).toHaveLength(1);
    const revalidated = await browseGithubMods("payload", fetchImpl, bag, 1_000 + 11 * 60_000);
    expect(revalidated).toEqual(first);
    expect(urls).toHaveLength(2);
  });
});
