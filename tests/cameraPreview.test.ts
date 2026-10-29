import { describe, expect, it } from "vitest";
import { assertManifest, type OsfsModManifest } from "../src/schema";

const manifest: OsfsModManifest = {
  schemaVersion: 1, id: "0sfs/camera-preview", kind: "plugin", name: "Camera preview", summary: "Optional live camera view",
  execution: "js", js: { path: "preview.js" }, cameraPreview: { apiVersion: 1 },
  provenance: { owner: "0SFS", repository: "https://github.com/0SFS/camera-preview", license: "AGPL-3.0-only", authors: [] },
};

describe("camera preview mod contract", () => {
  it("accepts a versioned optional JS provider", () => {
    expect(assertManifest(manifest)).toBe(manifest);
  });
  it("refuses an unsupported provider API before any code loads", () => {
    expect(() => assertManifest({ ...manifest, cameraPreview: { apiVersion: 2 } })).toThrow("cameraPreview.apiVersion 1");
  });
  it("requires a plugin and an explicit JavaScript entry", () => {
    expect(() => assertManifest({ ...manifest, kind: "aircraft" })).toThrow('kind "plugin"');
    expect(() => assertManifest({ ...manifest, execution: "declarative", js: undefined })).toThrow("JavaScript entry");
  });
  it.each(["", " ", " https://example.test/preview.js", "https://example.test/preview.js", "//example.test/preview.js", "/preview.js", "../preview.js", "%2e%2e/preview.js", "a\\preview.js"])("rejects nonlocal or empty provider entry %s", path => {
    expect(() => assertManifest({ ...manifest, js: { path } })).toThrow("js.path relative");
  });
});
