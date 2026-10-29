import { describe, expect, it } from "vitest";
import { ModDependencyError, ModRegistry } from "../src/loader";
import { modAboutParts } from "../src/aboutTree";
import type { OsfsModManifest } from "../src/schema";

function manifest(id: string, dependencies: string[] = [], kind: OsfsModManifest["kind"] = "aircraft"): OsfsModManifest {
  const repo = id.split("/")[1] ?? id;
  const document: OsfsModManifest = {
    schemaVersion: 1,
    id,
    kind,
    name: repo,
    summary: repo,
    execution: "declarative",
    provenance: { repository: `https://github.com/0SFS/${repo}`, owner: "0SFS", license: "AGPL-3.0-only", authors: ["0SFS contributors"] },
    dependencies,
  };
  if (kind === "payload") document.payload = { payloadType: "store", store: { key: repo } };
  if (kind === "engine") document.engine = { id: repo, label: repo, summary: repo, type: "turbine" };
  return document;
}

function fetchCounting(documents: Record<string, OsfsModManifest>) {
  const counts = new Map<string, number>();
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    counts.set(url, (counts.get(url) ?? 0) + 1);
    const document = documents[url];
    if (!document) return new Response("missing", { status: 404 });
    return new Response(JSON.stringify(document), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, counts };
}

describe("mod dependency loader", () => {
  it("loads a shared engine and weapon once when two aircraft depend on them", async () => {
    const aim = manifest("0sfs/aim-120", [], "payload");
    const f135 = manifest("0sfs/f135", [], "engine");
    const alpha = manifest("0sfs/alpha", ["0SFS/AIM-120", "0SFS/F135"]);
    const beta = manifest("0sfs/beta", ["0SFS/F135", "0SFS/AIM-120"]);
    const documents = {
      "https://0sfs.github.io/alpha/0sfs-mod.json": alpha,
      "https://0sfs.github.io/beta/0sfs-mod.json": beta,
      "https://0sfs.github.io/AIM-120/0sfs-mod.json": aim,
      "https://0sfs.github.io/F135/0sfs-mod.json": f135,
    };
    const { fetchImpl, counts } = fetchCounting(documents);
    const registry = new ModRegistry({ fetch: fetchImpl, entry: "user-add", confirmed: new Set() });
    const [loadedAlpha, loadedBeta] = await Promise.all([registry.load("0SFS/alpha"), registry.load("0SFS/beta")]);
    expect(loadedAlpha.dependencies.map(dependency => dependency.manifest.id)).toEqual(["0sfs/aim-120", "0sfs/f135"]);
    expect(loadedBeta.dependencies[0]).toBe(loadedAlpha.dependencies[1]);
    expect(loadedBeta.dependencies[1]).toBe(loadedAlpha.dependencies[0]);
    expect(counts.get("https://0sfs.github.io/AIM-120/0sfs-mod.json")).toBe(1);
    expect(counts.get("https://0sfs.github.io/F135/0sfs-mod.json")).toBe(1);
    expect(registry.loadedModsById.size).toBe(4);
    const tree = modAboutParts([loadedAlpha, loadedBeta]);
    expect(tree[0]?.parts?.map(part => part.name)).toEqual(["aim-120", "f135"]);
    expect(tree[1]?.parts?.every(part => part.listedAbove)).toBe(true);
  });

  it("keeps dependencies of a local mod on this computer", async () => {
    const quad = manifest("0sfs/quadcopter", [], "component");
    const dji = manifest("0sfs/dji-quadcopter", ["0SFS/Quadcopter"], "component");
    const mini = manifest("0sfs/dji-mini2", ["0SFS/DJI-Quadcopter"]);
    const documents = {
      "/dev-mods/dji-mini2/0sfs-mod.json": mini,
      "/dev-mods/dji-quadcopter/0sfs-mod.json": dji,
      "/dev-mods/quadcopter/0sfs-mod.json": quad,
    };
    const { fetchImpl, counts } = fetchCounting(documents);
    const registry = new ModRegistry({ fetch: fetchImpl, entry: "user-add" });
    const loaded = await registry.load("local:0SFS/DJI-Mini2");
    expect(loaded.baseUrl).toBe("/dev-mods/dji-mini2/");
    expect(loaded.dependencies[0]?.baseUrl).toBe("/dev-mods/dji-quadcopter/");
    expect(loaded.dependencies[0]?.dependencies[0]?.baseUrl).toBe("/dev-mods/quadcopter/");
    expect(counts.has("https://0sfs.github.io/DJI-Quadcopter/0sfs-mod.json")).toBe(false);
  });

  it("rejects a cycle with the dependency path", async () => {
    const documents = {
      "https://0sfs.github.io/a/0sfs-mod.json": manifest("0sfs/a", ["0SFS/b"]),
      "https://0sfs.github.io/b/0sfs-mod.json": manifest("0sfs/b", ["0SFS/a"]),
    };
    const { fetchImpl } = fetchCounting(documents);
    const registry = new ModRegistry({ fetch: fetchImpl, entry: "user-add" });
    await expect(registry.load("0SFS/a")).rejects.toBeInstanceOf(ModDependencyError);
    await expect(registry.load("0SFS/a")).rejects.toThrow("Circular mod dependency: 0SFS/a -> 0SFS/b -> 0SFS/a");
  });

  it("asks before a third-party mod and refuses unsandboxed JavaScript from a shared URL", async () => {
    const third: OsfsModManifest = {
      ...manifest("mallory/widget", [], "plugin"),
      provenance: { repository: "https://github.com/mallory/widget", owner: "mallory", license: "MIT", authors: ["Mallory"] },
      execution: "js",
      js: { path: "mod.js" },
    };
    const documents = { "https://mallory.github.io/widget/0sfs-mod.json": third };
    const { fetchImpl } = fetchCounting(documents);
    const registry = new ModRegistry({ fetch: fetchImpl, entry: "startup-url", viewer: { githubUsername: "ada" } });
    await expect(registry.load("mallory/widget")).rejects.toThrow(/UNSANDBOXED CODE/);
    const preview = await registry.preview("mallory/widget");
    expect(preview.security.blockAutomaticUrl).toBe(true);
  });
});
