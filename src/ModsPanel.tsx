import { useState } from "react";
import type { ModBrowseKind } from "./githubDiscovery";
import type { GithubModRepository } from "./githubDiscovery";
import type { ModAboutPart } from "./aboutTree";
import type { ModSecurityAssessment } from "./security";
import { normalizeModSource } from "./normalizeModSource";
import "./mods.css";

export interface ModsPanelProps {
  installed: readonly ModAboutPart[];
  developerUsername: string;
  onDeveloperUsername: (username: string) => void;
  onAdd: (source: string) => void;
  /** Dev server can serve a checkout at /dev-mods/. Hidden on a published build. */
  allowLocal?: boolean;
  onRemove?: (source: string) => void;
  notice: string | null;
  pendingWarning: ModSecurityAssessment | null;
  onConfirmWarning: () => void;
  onDismissWarning: () => void;
  source: string;
  onSource: (source: string) => void;
  place: "github" | "local";
  onPlace: (place: "github" | "local") => void;
  browseKind: ModBrowseKind;
  onBrowseKind: (kind: ModBrowseKind) => void;
  browseResults: readonly GithubModRepository[];
  browseError: string | null;
  browseStatus: "idle" | "loading" | "waiting" | "ready" | "error";
  browseRetryAt: number | null;
  onBrowse: () => void;
  onInstallResult: (fullName: string) => void;
  shareUrl: string;
}

const BROWSE: readonly { id: ModBrowseKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "aircraft", label: "Aircraft" },
  { id: "engine", label: "Engines" },
  { id: "component", label: "Components" },
  { id: "payload", label: "Payloads" },
  { id: "plugin", label: "Plugins" },
  { id: "modpack", label: "Modpacks" },
];

function ModTree({ parts, onRemove }: { parts: readonly ModAboutPart[]; onRemove?: (source: string) => void }) {
  if (parts.length === 0) return <p className="flight-panel__hint">No mods are loaded yet.</p>;
  return (
    <ul className="osfs-mods__tree">
      {parts.map(part => (
        <li key={`${part.repository ?? part.name}-${part.listedAbove ? "ref" : "full"}`}>
          <span>{part.name}</span>
          {part.version ? <span className="flight-panel__hint"> {part.version}</span> : null}
          {part.listedAbove ? <span className="flight-panel__hint"> same copy as above</span> : null}
          {part.removable && part.source && onRemove ? <button type="button" onClick={() => onRemove(part.source!)}>Remove</button> : null}
          {part.parts && part.parts.length > 0 ? <ModTree parts={part.parts} onRemove={onRemove} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** Find and add mods in one place. Confirmation stays in this tab. */
export function ModsPanel(props: ModsPanelProps) {
  const [username, setUsername] = useState(props.developerUsername);
  const local = props.allowLocal === true && props.place === "local";
  const value = props.source.trim().replace(/^local:/, "");
  let canAdd = false;
  try { normalizeModSource(value); canAdd = true; } catch { /* Search terms aren't mod sources. */ }
  return (
    <div className="flight-panel__content osfs-mods">
      <section className="osfs-mods__card osfs-mods__add">
        <h3>Add mod</h3>
        <form className="osfs-mods__form" onSubmit={(event) => {
          event.preventDefault();
          if (canAdd) props.onAdd(local ? `local:${value}` : value);
        }}>
          {props.allowLocal ? (
            <div className="osfs-mods__kinds" role="group" aria-label="Where to load the mod">
              <button type="button" aria-pressed={!local} onClick={() => props.onPlace("github")}>GitHub</button>
              <button type="button" aria-pressed={local} onClick={() => props.onPlace("local")}>This computer</button>
            </div>
          ) : null}
          <label className="flight-panel__field">
            <span>{local ? "Repository on this computer" : "Search mods or enter a GitHub URL"}</span>
            <input value={props.source} onChange={(event) => props.onSource(event.target.value)} placeholder="{org}/{repo}" aria-label={local ? "Mod owner and repo on this computer" : "Search mods or enter a GitHub URL or owner/repo"} autoComplete="off" spellCheck={false} aria-controls={local ? undefined : "osfs-mods-results"} />
          </label>
          {local ? <p className="flight-panel__hint">Loads that checkout from this dev server, including its dependencies.</p> : null}
          <button className="flight-panel__command" type="submit" disabled={!canAdd}>Add mod</button>
          {props.notice ? <p className="flight-panel__hint is-error">{props.notice}</p> : null}
          <button type="button" className="osfs-mods__help" popoverTarget="osfs-mods-safety" aria-label="How mod safety works">?</button>
          <div id="osfs-mods-safety" popover="auto" className="osfs-mods__help-body">
            <p>Search public repositories tagged 0sfs-mod, or enter a GitHub URL or owner/repo to add a mod directly. Added mods load their published copy.</p>
            <p>Official 0SFS and foss-earth mods load directly. A repository you own loads directly once your GitHub username is set. Any other owner asks before it is enabled. Declarative mods are data only. Rust/WASM mods stay in a sandbox. JavaScript mods are unsandboxed and never start from a shared link.</p>
            <a href="https://github.com/0SFS/docs/blob/main/modding.md" target="_blank" rel="noreferrer">Modding guide</a>
          </div>
        </form>
        {props.pendingWarning ? (
          <dialog open className="osfs-mods__dialog" aria-labelledby="osfs-mods-warning-title">
            <h3 id="osfs-mods-warning-title">{props.pendingWarning.severity === "high" ? "Unsandboxed mod" : props.pendingWarning.severity === "warning" ? "Third-party WASM" : "Third-party mod"}</h3>
            <p>{props.pendingWarning.message}</p>
            <p className="flight-panel__hint">Owner @{props.pendingWarning.owner}. Execution {props.pendingWarning.execution}.</p>
            <button type="button" onClick={props.onConfirmWarning}>Confirm and enable</button>
            <button type="button" onClick={props.onDismissWarning}>Cancel</button>
          </dialog>
        ) : null}
        {!local ? <>
        <div className="osfs-mods__kinds" role="group" aria-label="Mod kind">
          {BROWSE.map(kind => (
            <button type="button" key={kind.id} aria-pressed={props.browseKind === kind.id} onClick={() => props.onBrowseKind(kind.id)}>{kind.label}</button>
          ))}
        </div>
        <div role="status" aria-live="polite" className="flight-panel__hint">
          {props.browseStatus === "loading" ? "Searching GitHub…" : props.browseStatus === "waiting" ? `GitHub search limit reached. Search resumes${props.browseRetryAt ? ` at ${new Date(props.browseRetryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : " shortly"}.` : props.browseStatus === "ready" && props.browseResults.length === 0 ? "No matching mods. Try another name or add a repository directly." : props.browseStatus === "idle" && props.source.trim().length === 1 ? "Type at least 2 characters to search." : null}
        </div>
        {props.browseError ? <div className="flight-panel__hint is-error" role="alert">{props.browseError} <button type="button" onClick={props.onBrowse}>Retry</button></div> : null}
        <ul id="osfs-mods-results" className="osfs-mods__results" aria-label="Matching mods" aria-busy={props.browseStatus === "loading" || props.browseStatus === "waiting"} role="list">
          {props.browseResults.map(repository => (
            <li key={repository.fullName}>
              <button className="osfs-mods__result" type="button" aria-label={`Add ${repository.fullName}`} onClick={() => props.onInstallResult(repository.fullName)}>
                <strong>{repository.fullName}</strong>
                {repository.description ? <span className="flight-panel__hint osfs-mods__description">{repository.description}</span> : null}
                <span className="osfs-mods__result-footer"><span className="flight-panel__hint">{repository.stars} stars</span><span>Add</span></span>
              </button>
            </li>
          ))}
        </ul>
        </> : null}
      </section>
      <section className="osfs-mods__card">
        <h3>Installed mods</h3>
        <ModTree parts={props.installed} onRemove={props.onRemove} />
        <p className="flight-panel__hint">The default modpack brings in what every flight starts with. Each mod sits under the mod that needs it, and a shared one is loaded once.</p>
      </section>
      <section className="osfs-mods__card">
        <h3>Share modded flight</h3>
        <label className="flight-panel__field">
          <span>Link</span>
          <input readOnly value={props.shareUrl} aria-label="Share modded flight link" />
        </label>
        <p className="flight-panel__hint">Built-in aircraft stay in the simulator. Added mods are listed in ?mods=.</p>
      </section>
      <section className="osfs-mods__card">
        <h3>Developer</h3>
        <form onSubmit={(event) => { event.preventDefault(); props.onDeveloperUsername(username.trim()); }}>
          <label className="flight-panel__field">
            <span>GitHub username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} aria-label="GitHub username" autoComplete="username" />
          </label>
          <button type="submit">Save username</button>
        </form>
        <p className="flight-panel__hint">Mods in this username load without a warning. A later sign-in can fill this in.</p>
      </section>
    </div>
  );
}
