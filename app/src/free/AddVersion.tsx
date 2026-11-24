import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { checkLocalVersion, localVersions, openVersionFolder, pickLocalVersion, type LocalVersion } from "../lib/free";
import { isMac, joinPath } from "../lib/os";

type Kind = "php" | "node";

const NAMES: Record<Kind, string> = { php: "PHP", node: "Node" };
const EXAMPLE: Record<Kind, string> = { php: "php-8.3.14", node: "node-24.22.3" };
const FOLDER: Record<Kind, string> = { php: "php", node: "nodejs" };
const SITE: Record<Kind, string> = { php: "windows.php.net", node: "nodejs.org" };

/** Steps for adding a PHP or Node version by hand. Free has no download button on purpose. */
export function AddVersion({ installRoot, onBack, onChanged }: {
  installRoot: string | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<Kind>("php");
  const [versions, setVersions] = useState<LocalVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const found = await localVersions().catch(() => []);
    setVersions(found);
    return found;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const name = NAMES[kind];
  const target = joinPath(installRoot ?? (isMac ? "~/NexDB" : "C:\\NexDB"), "bin", FOLDER[kind], EXAMPLE[kind]);
  const added = versions.filter((v) => v.id === kind);

  async function checkAgain() {
    setBusy(true);
    setResult(null);
    const waiting = (await load()).filter((v) => v.id === kind && !v.ready);
    if (waiting.length === 0) {
      setResult({ ok: false, text: `NexDB doesn't see a new ${name} folder yet. Name it like ${EXAMPLE[kind]}.` });
      setBusy(false);
      return;
    }
    const lines: string[] = [];
    let allOk = true;
    for (const v of waiting) {
      try {
        await checkLocalVersion(kind, v.folder);
        lines.push(`${name} ${v.version} is ready.`);
      } catch (e) {
        allOk = false;
        lines.push(`${v.folder}: ${String(e)}`);
      }
    }
    await load();
    onChanged();
    setResult({ ok: allOk, text: lines.join(" ") });
    setBusy(false);
  }

  async function choose() {
    setBusy(true);
    setResult(null);
    try {
      const version = await pickLocalVersion(kind);
      if (version) {
        setResult({ ok: true, text: `${name} ${version} is ready.` });
        await load();
        onChanged();
      }
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="free-main free-panel">
      <button type="button" className="link-button free-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to NexDB
      </button>
      <h1>Add a version by hand</h1>
      <p className="free-sub">NexDB checks it first, then adds it to your version list.</p>

      <div className="free-tabs" role="group" aria-label="What to add">
        {(["php", "node"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={k === kind ? "btn btn-small btn-primary" : "btn btn-small"}
            aria-pressed={k === kind}
            onClick={() => {
              setKind(k);
              setResult(null);
            }}
          >
            {NAMES[k]}
          </button>
        ))}
      </div>

      {isMac ? (
        <ol className="free-steps">
          <li>Install {name} yourself, for example with Homebrew.</li>
          <li>
            Press <strong>Choose {name}</strong> and select <code>{kind === "php" ? "php-cgi" : "node"}</code>.
          </li>
          <li>NexDB tests it and tells you if it works.</li>
        </ol>
      ) : (
        <ol className="free-steps">
          <li>
            Download the 64-bit {name} zip from <code>{SITE[kind]}</code>.
          </li>
          <li>
            Extract it so the program is directly inside <code>{target}</code>.
          </li>
          <li>
            Press <strong>Check again</strong>. NexDB tells you if the folder works.
          </li>
        </ol>
      )}

      {added.length > 0 && (
        <ul className="free-version-list" aria-label={`${name} versions on this computer`}>
          {added.map((v) => (
            <li key={v.folder}>
              <span>{name} {v.version}</span>
              <span className="free-card-detail">{v.active ? "In use" : v.ready ? "Ready" : "Not checked yet"}</span>
            </li>
          ))}
        </ul>
      )}

      {result && (
        <p className={result.ok ? "set-ok" : "field-error"} role={result.ok ? "status" : "alert"}>
          {result.text}
        </p>
      )}

      <div className="free-row">
        {isMac ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void choose()}>
            {busy ? "Checking…" : `Choose ${name}`}
          </button>
        ) : (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => void openVersionFolder(kind).catch((e) => setResult({ ok: false, text: String(e) }))}>
              Open {name} folder
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void checkAgain()}>
              {busy ? "Checking…" : "Check again"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
