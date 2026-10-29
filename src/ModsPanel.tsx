import { useState } from "react";
import type { ModBrowseKind } from "./githubDiscovery";
import type { GithubModRepository } from "./githubDiscovery";
import type { ModAboutPart } from "./aboutTree";
import type { ModSecurityAssessment } from "./security";
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
  browseKind: ModBrowseKind;
  onBrowseKind: (kind: ModBrowseKind) => void;
  browseResults: readonly GithubModRepository[];
  browseError: string | null;
  onBrowse: () => void;
  onInstallResult: (fullName: string) => void;
  shareUrl: string;
}

const BROWSE: readonly { id: ModBrowseKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "aircraft", label: "Aircraft" },
  { id: "engine", label: "Engines" },
  { id: "payload", label: "Payloads" },
  { id: "plugin", label: "Plugins" },
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

/** Installed mods, adding a GitHub URL, topic browse, and a share link. Confirmation stays in this tab. */
export function ModsPanel(props: ModsPanelProps) {
  const [source, setSource] = useState("");
  const [place, setPlace] = useState<"github" | "local">("github");
  const [username, setUsername] = useState(props.developerUsername);
  const local = props.allowLocal === true && place === "local";
  return (
    <div className="flight-panel__content osfs-mods">
      <section className="osfs-mods__card">
        <h3>Installed mods</h3>
        <ModTree parts={props.installed} onRemove={props.onRemove} />
        <p className="flight-panel__hint">Engines and payload items are nested under the aircraft that carries them. A shared weapon is loaded once.</p>
      </section>
      <section className="osfs-mods__card">
        <h3>Add mod</h3>
        <form onSubmit={(event) => {
          event.preventDefault();
          const value = source.trim().replace(/^local:/, "");
          if (value) props.onAdd(local ? `local:${value}` : value);
        }}>
          {props.allowLocal ? (
            <div className="osfs-mods__kinds" role="group" aria-label="Where to load the mod">
              <button type="button" aria-pressed={place === "github"} onClick={() => setPlace("github")}>GitHub</button>
              <button type="button" aria-pressed={place === "local"} onClick={() => setPlace("local")}>This computer</button>
            </div>
          ) : null}
          <label className="flight-panel__field">
            <span>{local ? "owner/repo on this computer" : "GitHub URL or owner/repo"}</span>
            <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="0SFS/DJI-Mini2" aria-label={local ? "Mod owner and repo on this computer" : "Mod GitHub URL or owner/repo"} />
          </label>
          <p className="flight-panel__hint">{local ? "Loads that checkout from this dev server, including its dependencies." : "Loads the published GitHub Pages copy."}</p>
          <button type="submit">Add mod</button>
          {props.notice ? <p className="flight-panel__hint is-error">{props.notice}</p> : null}
          <button type="button" className="osfs-mods__help" popoverTarget="osfs-mods-safety" aria-label="How mod safety works">?</button>
          <div id="osfs-mods-safety" popover="auto" className="osfs-mods__help-body">
            <p>Official 0SFS and foss-earth mods load directly. A repository you own loads directly once your GitHub username is set. Any other owner asks before it is enabled. Declarative mods are data only. Rust/WASM mods stay in a sandbox. JavaScript mods are unsandboxed and never start from a shared link.</p>
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
      </section>
      <section className="osfs-mods__card">
        <h3>Browse GitHub mods</h3>
        <div className="osfs-mods__kinds" role="group" aria-label="Mod kind">
          {BROWSE.map(kind => (
            <button type="button" key={kind.id} aria-pressed={props.browseKind === kind.id} onClick={() => props.onBrowseKind(kind.id)}>{kind.label}</button>
          ))}
        </div>
        <button type="button" onClick={props.onBrowse}>Search topic:0sfs-mod</button>
        {props.browseError ? <p className="flight-panel__hint is-error">{props.browseError}</p> : null}
        <ul className="osfs-mods__tree">
          {props.browseResults.map(repository => (
            <li key={repository.fullName}>
              <button type="button" onClick={() => props.onInstallResult(repository.fullName)}>{repository.fullName}</button>
              <span className="flight-panel__hint"> {repository.stars} stars. {repository.description}</span>
            </li>
          ))}
        </ul>
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
