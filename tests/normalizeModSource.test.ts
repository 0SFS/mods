import { describe, expect, it } from "vitest";
import { normalizeModSource } from "../src/normalizeModSource";

const bundled = new Set(["0sfs/f135", "0sfs/aim-120", "0sfs/c172"]);

describe("normalizeModSource", () => {
  it("canonicalizes GitHub shorthand and keeps bundled HEAD on /mods/", () => {
    expect(normalizeModSource("0SFS/F135", { bundledRepos: bundled })).toEqual({
      canonicalKey: "github:0sfs/f135@HEAD",
      manifestUrl: "/mods/f135/0sfs-mod.json",
      owner: "0SFS",
      repo: "F135",
      ref: "HEAD",
      bundled: true,
    });
    expect(normalizeModSource("0SFS/AIM-120", { bundledRepos: bundled }).canonicalKey).toBe("github:0sfs/aim-120@HEAD");
    expect(normalizeModSource("alice/my-plane@v1.2.0")).toMatchObject({
      canonicalKey: "github:alice/my-plane@v1.2.0",
      manifestUrl: "https://raw.githubusercontent.com/alice/my-plane/v1.2.0/public/0sfs-mod.json",
      bundled: false,
    });
  });

  it("reads repository, tree, pages and direct manifest URLs", () => {
    expect(normalizeModSource("https://github.com/0SFS/AIM-120", { bundledRepos: bundled }).canonicalKey).toBe("github:0sfs/aim-120@HEAD");
    expect(normalizeModSource("https://github.com/alice/my-plane/tree/main").ref).toBe("main");
    expect(normalizeModSource("https://github.com/alice/my-plane/tree/release/1").canonicalKey).toBe("github:alice/my-plane@release/1");
    expect(normalizeModSource("https://alice.github.io/my-plane/").manifestUrl).toBe("https://alice.github.io/my-plane/0sfs-mod.json");
    expect(normalizeModSource("http://localhost:7471/0sfs-mod.json")).toMatchObject({
      canonicalKey: "url:http://localhost:7471/0sfs-mod.json",
      bundled: false,
    });
  });
});
