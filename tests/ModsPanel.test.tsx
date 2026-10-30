// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModsPanel, type ModsPanelProps } from "../src/ModsPanel";
import { assessModSecurity } from "../src/security";

let root: Root;
let host: HTMLDivElement;

function defaults(): ModsPanelProps {
  return {
    installed: [], developerUsername: "", onDeveloperUsername: vi.fn(), onAdd: vi.fn(),
    notice: null, pendingWarning: null, onConfirmWarning: vi.fn(), onDismissWarning: vi.fn(),
    source: "", onSource: vi.fn(), place: "github", onPlace: vi.fn(), allowLocal: true,
    browseKind: "all", onBrowseKind: vi.fn(), browseResults: [], browseError: null,
    browseStatus: "idle", browseRetryAt: null, onBrowse: vi.fn(), onInstallResult: vi.fn(),
    shareUrl: "https://example.test/fly/",
  };
}

async function render(props: ModsPanelProps) {
  await act(async () => root.render(<ModsPanel {...props} />));
}

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(entry => entry.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("mod search panel", () => {
  it("uses the requested placeholder and reports text, category and location changes", async () => {
    const props = defaults();
    await render(props);
    const input = host.querySelector<HTMLInputElement>('input[placeholder="{org}/{repo}"]')!;
    expect(input).not.toBeNull();
    expect(button("Add mod").disabled).toBe(true);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "camera");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      button("Components").click();
      button("This computer").click();
    });
    expect(props.onSource).toHaveBeenCalledWith("camera");
    expect(props.onBrowseKind).toHaveBeenCalledWith("component");
    expect(props.onPlace).toHaveBeenCalledWith("local");
  });

  it("adds a matching repository by full name through one accessible result action", async () => {
    const props = defaults();
    props.source = "camera";
    props.browseStatus = "ready";
    props.browseResults = [{ fullName: "alice/camera", description: "Camera tools", stars: 7, topics: ["0sfs-mod"], url: "https://github.com/alice/camera" }];
    await render(props);
    expect(button("Add mod").disabled).toBe(true);
    const result = host.querySelector<HTMLButtonElement>('[aria-label="Add alice/camera"]')!;
    expect(result.textContent).toContain("Camera tools");
    expect(result.textContent).toContain("7 stars");
    await act(async () => result.click());
    expect(props.onInstallResult).toHaveBeenCalledExactlyOnceWith("alice/camera");
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it.each([
    [" alice/plane@v1.2.0 ", "github", "alice/plane@v1.2.0"],
    ["https://github.com/alice/plane/tree/v1.2.0", "github", "https://github.com/alice/plane/tree/v1.2.0"],
    ["https://alice.github.io/plane/0sfs-mod.json", "github", "https://alice.github.io/plane/0sfs-mod.json"],
    ["local:alice/plane", "local", "local:alice/plane"],
  ] as const)("submits the direct source %s", async (source, place, expected) => {
    const props = { ...defaults(), source, place };
    await render(props);
    expect(button("Add mod").disabled).toBe(false);
    await act(async () => button("Add mod").click());
    expect(props.onAdd).toHaveBeenCalledExactlyOnceWith(expected);
    if (place === "local") expect(host.querySelector('[aria-label="Matching mods"]')).toBeNull();
  });

  it("keeps the security confirmation and cancellation available beside search", async () => {
    const props = { ...defaults(), pendingWarning: assessModSecurity("alice", "js") };
    await render(props);
    expect(host.querySelector("dialog[open]")?.textContent).toContain("Unsandboxed mod");
    await act(async () => { button("Confirm and enable").click(); button("Cancel").click(); });
    expect(props.onConfirmWarning).toHaveBeenCalledOnce();
    expect(props.onDismissWarning).toHaveBeenCalledOnce();
  });

  it("announces loading, waiting, empty results and recoverable errors", async () => {
    const props = { ...defaults(), source: "camera", browseStatus: "loading" as const };
    await render(props);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Searching GitHub");
    expect(host.querySelector('[aria-label="Matching mods"]')?.getAttribute("aria-busy")).toBe("true");
    await render({ ...props, browseStatus: "waiting", browseRetryAt: Date.now() + 60_000 });
    expect(host.querySelector('[role="status"]')?.textContent).toContain("GitHub search limit reached");
    await render({ ...props, browseStatus: "ready" });
    expect(host.querySelector('[role="status"]')?.textContent).toContain("No matching mods");
    await render({ ...props, browseStatus: "error", browseError: "GitHub is unavailable." });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("GitHub is unavailable.");
    await act(async () => button("Retry").click());
    expect(props.onBrowse).toHaveBeenCalledOnce();
  });
});
