import { describe, expect, it } from "vitest";
import { assertManifest, inferExecution, type OsfsModManifest } from "../src/schema";

const renderer: OsfsModManifest = {
  schemaVersion: 1, id: "example/electric-sound", kind: "component", name: "Electric sound", summary: "Numeric rotor source",
  execution: "wasm", provenance: { repository: "https://github.com/example/electric-sound", owner: "example", license: "AGPL-3.0-only", authors: [] },
  audioRenderer: { apiVersion: 1, abi: "osfs-engine-voice-v1", rendererId: "procedural-electric-v1", engineClasses: ["electric"],
    telemetrySchemaIds: ["multirotor-electric-v1"], wasm: { path: "audio/electric/voice.wasm", sha256: "f".repeat(64) } },
};

describe("sandboxed audio renderer contribution", () => {
  it("infers WASM execution for a source generator without flight WASM or JS entries", () => {
    expect(inferExecution(renderer)).toBe("wasm");
    expect(assertManifest(renderer)).toBe(renderer);
  });
  it("requires the supported numeric voice ABI", () => {
    expect(() => assertManifest({ ...renderer, audioRenderer: { ...renderer.audioRenderer, abi: "future" } })).toThrow("ABI osfs-engine-voice-v1");
  });
  it("requires a content component and refuses mixed executable entries", () => {
    expect(() => assertManifest({ ...renderer, kind: "engine" })).toThrow("must be a component");
    expect(() => assertManifest({ ...renderer, execution: "js", js: { path: "module.js" } })).toThrow("only an audioRenderer WASM entry");
  });
  it.each(["../voice.wasm", "%2e%2e/voice.wasm", "/voice.wasm", "https://example.test/voice.wasm", "a\\voice.wasm", "voice.wasm?x", "", " voice.wasm"])("rejects unsafe module path %s", path => {
    expect(() => assertManifest({ ...renderer, audioRenderer: { ...renderer.audioRenderer, wasm: { path, sha256: "f".repeat(64) } } })).toThrow("relative wasm.path");
  });
  it("requires an integrity digest and rejects empty telemetry contracts", () => {
    expect(() => assertManifest({ ...renderer, audioRenderer: { ...renderer.audioRenderer, wasm: { path: "voice.wasm", sha256: "wrong" } } })).toThrow("SHA-256");
    expect(() => assertManifest({ ...renderer, audioRenderer: { ...renderer.audioRenderer, telemetrySchemaIds: [] } })).toThrow("telemetrySchemaIds");
  });
  it("keeps executable source contributions out of modpacks", () => {
    expect(() => assertManifest({ ...renderer, kind: "modpack", dependencies: ["example/electric-sound"] })).toThrow();
  });
});
