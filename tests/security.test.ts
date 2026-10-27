import { describe, expect, it } from "vitest";
import { assessModSecurity } from "../src/security";
import { readViewerIdentity, writeDeveloperUsername } from "../src/identity";

describe("mod ownership", () => {
  it("trusts 0SFS, foss-earth and the current developer, and warns on everyone else", () => {
    expect(assessModSecurity("0SFS", "declarative").requiresConfirmation).toBe(false);
    expect(assessModSecurity("foss-earth", "wasm").tier).toBe("official");
    expect(assessModSecurity("Ada", "wasm", { githubUsername: "ada" }).tier).toBe("user");
    const data = assessModSecurity("mallory", "declarative", { githubUsername: "ada" });
    expect(data).toMatchObject({ tier: "third-party", severity: "notice", requiresConfirmation: true, blockAutomaticUrl: false });
    const wasm = assessModSecurity("mallory", "wasm");
    expect(wasm.severity).toBe("warning");
    expect(wasm.message).toContain("Unverified third-party WASM mod by @mallory");
    const js = assessModSecurity("mallory", "js");
    expect(js).toMatchObject({ severity: "high", blockAutomaticUrl: true, requiresConfirmation: true });
    expect(js.message).toContain("UNSANDBOXED CODE");
  });

  it("reads the developer username setting", () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
    expect(readViewerIdentity(storage).githubUsername).toBeNull();
    writeDeveloperUsername(storage, "Ada");
    expect(readViewerIdentity(storage)).toMatchObject({ githubUsername: "Ada", authenticatedProvider: "github" });
  });
});
