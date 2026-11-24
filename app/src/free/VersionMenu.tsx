import { useVersion } from "../lib/versions";
import type { LocalVersion } from "../lib/free";

const ADD = "__add";

/** The PHP version in use, and Node when more than one is ready. */
export function VersionMenu({ versions, busy, onAdd, onChanged, run }: {
  versions: LocalVersion[];
  busy: boolean;
  onAdd: () => void;
  onChanged: () => void;
  run: (label: string, failed: string, work: () => Promise<void>) => Promise<void>;
}) {
  const ready = (id: string) => versions.filter((v) => v.id === id && v.ready);
  const php = ready("php");
  const node = ready("node");

  const change = (id: "php" | "node", name: string, version: string) => {
    if (version === ADD) {
      onAdd();
      return;
    }
    void run(`Switching to ${name} ${version}…`, `NexDB couldn't switch to ${name} ${version}.`, async () => {
      await useVersion(id, version);
      onChanged();
    });
  };

  return (
    <section className="free-card" data-tour="free-php">
      <h2>
        <label htmlFor="free-php">PHP version</label>
      </h2>
      <select
        id="free-php"
        className="free-select"
        disabled={busy || php.length === 0}
        value={php.find((v) => v.active)?.version ?? ""}
        onChange={(e) => change("php", "PHP", e.target.value)}
      >
        {php.map((v) => (
          <option key={v.version} value={v.version}>
            {v.version}
          </option>
        ))}
        <option value={ADD}>Add another version…</option>
      </select>
      {node.length > 1 ? (
        <>
          <label className="free-card-detail" htmlFor="free-node">
            Node version
          </label>
          <select
            id="free-node"
            className="free-select"
            disabled={busy}
            value={node.find((v) => v.active)?.version ?? ""}
            onChange={(e) => change("node", "Node", e.target.value)}
          >
            {node.map((v) => (
              <option key={v.version} value={v.version}>
                {v.version}
              </option>
            ))}
          </select>
        </>
      ) : (
        <button type="button" className="link-button free-card-detail" onClick={onAdd}>
          Add PHP or Node by hand
        </button>
      )}
    </section>
  );
}
