import { useCallback, useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { File, Folder, FolderInput, FolderOpen, FolderPlus, Pencil, Trash2, Upload } from "lucide-react";
import { inDesktopApp } from "../lib/scan";
import { addFiles, importProject, listFiles, listSites, newFolder, removeEntry, renameEntry, size, unzipFile, type Entry, type Site } from "../lib/nexhost";
import { listProjects, type Project } from "../lib/projects";

/** The site's files, like a hosting file manager: drop files or a zip from Explorer onto it. */
const KIND: Record<string, string> = { laravel: "Laravel", wordpress: "WordPress", node: "Node", php: "PHP", html: "HTML", empty: "empty" };

export function FileManager({ site, onSites }: { site: Site; onSites?: (s: Site[]) => void }) {
  const [rel, setRel] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [over, setOver] = useState(false);
  const [zips, setZips] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Import project: the projects in NexDB's www folder, the one picked, and whether it is copying.
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pick, setPick] = useState("");
  const [copying, setCopying] = useState(false);

  const load = useCallback(() => {
    listFiles(site.name, rel)
      .then(setEntries)
      .catch((e) => setStatus({ ok: false, text: String(e) }));
  }, [site.name, rel]);
  useEffect(load, [load]);

  const join = (name: string) => (rel ? `${rel}/${name}` : name);
  const run = (work: Promise<unknown>, done: string) =>
    work
      .then(() => {
        setStatus({ ok: true, text: done });
        load();
      })
      .catch((e) => setStatus({ ok: false, text: String(e) }));

  // Files dropped from Explorer: zips can be unpacked, everything else is copied in.
  useEffect(() => {
    if (!inDesktopApp) return;
    const off = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "over" || e.payload.type === "enter") setOver(true);
      else if (e.payload.type === "leave") setOver(false);
      else if (e.payload.type === "drop") {
        setOver(false);
        const paths = e.payload.paths;
        const zipList = paths.filter((p) => p.toLowerCase().endsWith(".zip"));
        const others = paths.filter((p) => !p.toLowerCase().endsWith(".zip"));
        if (others.length) run(addFiles(site.name, rel, others), `Added ${others.length} ${others.length === 1 ? "item" : "items"}.`);
        if (zipList.length) setZips(zipList);
      }
    });
    const prog = listen<{ done: number; total: number }>("nexhost-unzip", (e) => setProgress(e.payload));
    return () => {
      void off.then((f) => f());
      void prog.then((f) => f());
    };
  });

  const crumbs = rel ? rel.split("/") : [];

  return (
    <section className={over ? "set-card nh-files over" : "set-card nh-files"} data-guide="nexhost-files">
      <div className="nh-files-head">
        <nav className="nh-crumbs" aria-label="Folder">
          <button className="btn btn-small btn-quiet" onClick={() => setRel("")}>
            {site.name}
          </button>
          {crumbs.map((c, i) => (
            <span key={i}>
              {" / "}
              <button className="btn btn-small btn-quiet" onClick={() => setRel(crumbs.slice(0, i + 1).join("/"))}>
                {c}
              </button>
            </span>
          ))}
        </nav>
        <div>
          <button
            className="btn btn-small"
            onClick={() => {
              const name = window.prompt("New folder name");
              if (name?.trim()) run(newFolder(site.name, rel, name.trim()), `Made the folder ${name.trim()}.`);
            }}
          >
            <FolderPlus size={14} aria-hidden="true" /> New folder
          </button>{" "}
          <button
            className="btn btn-small"
            data-guide="nexhost-import"
            onClick={() => {
              setStatus(null);
              listProjects()
                .then((info) => {
                  setProjects(info.projects);
                  setPick(info.projects[0]?.name ?? "");
                })
                .catch((e) => setStatus({ ok: false, text: String(e) }));
            }}
          >
            <FolderInput size={14} aria-hidden="true" /> Import project
          </button>{" "}
          {inDesktopApp && (
            <button className="btn btn-small" onClick={() => void revealItemInDir(site.path)}>
              <FolderOpen size={14} aria-hidden="true" /> Open in Explorer
            </button>
          )}
        </div>
      </div>

      <p className="nh-drop">
        <Upload size={14} aria-hidden="true" /> Drag files, folders or a .zip from Explorer onto this window to add them here.
      </p>

      {projects && (
        <div className="nh-zip" role="dialog" aria-label="Import a project">
          {projects.length === 0 ? (
            <p>NexDB's www folder has no projects yet. Make one on the Projects page first.</p>
          ) : (
            <>
              <p>
                Copy a project from NexDB's www folder into {rel ? <code>{rel}</code> : "this site"}. The project in www stays as it is;
                node_modules and .git are left out.
              </p>
              <label className="nh-import-pick">
                <span className="sr-only">Project</span>
                <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={copying}>
                  {projects.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({KIND[p.kind] ?? p.kind})
                    </option>
                  ))}
                </select>
              </label>{" "}
              <button
                className="btn btn-small btn-primary"
                disabled={!pick || copying}
                onClick={() => {
                  setCopying(true);
                  setStatus({ ok: true, text: `Copying ${pick}… big projects take a minute.` });
                  importProject(site.name, rel, pick)
                    .then(async (folder) => {
                      setProjects(null);
                      const sites = await listSites();
                      onSites?.(sites);
                      const now = sites.find((s) => s.name === site.name);
                      const opens = now && now.web_root !== site.web_root ? ` The site now opens ${folder}.` : "";
                      setStatus({ ok: true, text: `Imported ${pick} as ${folder}.${opens}` });
                      load();
                    })
                    .catch((e) => setStatus({ ok: false, text: String(e) }))
                    .finally(() => setCopying(false));
                }}
              >
                {copying ? "Copying…" : "Import"}
              </button>{" "}
            </>
          )}
          <button className="btn btn-small" disabled={copying} onClick={() => setProjects(null)}>
            Cancel
          </button>
        </div>
      )}

      {zips.length > 0 && (
        <div className="nh-zip" role="dialog" aria-label="Unpack zip">
          <p>
            {zips.length === 1 ? zips[0].split(/[\\/]/).pop() : `${zips.length} zip files`}: unpack here, or add as{" "}
            {zips.length === 1 ? "a file" : "files"}?
          </p>
          <button
            className="btn btn-small btn-primary"
            onClick={() => {
              const list = zips;
              setZips([]);
              setProgress(null);
              run(
                list.reduce<Promise<unknown>>((p, z) => p.then(() => unzipFile(site.name, rel, z)), Promise.resolve()),
                "Unpacked.",
              ).finally(() => setProgress(null));
            }}
          >
            Unpack here
          </button>{" "}
          <button
            className="btn btn-small"
            onClick={() => {
              const list = zips;
              setZips([]);
              run(addFiles(site.name, rel, list), "Added.");
            }}
          >
            Add as {zips.length === 1 ? "a file" : "files"}
          </button>{" "}
          <button className="btn btn-small btn-quiet" onClick={() => setZips([])}>
            Cancel
          </button>
        </div>
      )}
      {progress && (
        <p role="status">
          Unpacking… {progress.done} of {progress.total} files
        </p>
      )}
      {status && (
        <p className={status.ok ? "set-ok" : "field-error"} role="status">
          {status.text}
        </p>
      )}

      {entries === null ? (
        <p role="status">Loading files…</p>
      ) : entries.length === 0 ? (
        <p className="set-lede">This folder is empty. Drop files here.</p>
      ) : (
        <table className="nh-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Changed</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name}>
                <td>
                  {e.dir ? (
                    <button className="btn btn-small btn-quiet" onClick={() => setRel(join(e.name))}>
                      <Folder size={14} aria-hidden="true" /> {e.name}
                    </button>
                  ) : (
                    <span className="nh-file">
                      <File size={14} aria-hidden="true" /> {e.name}
                    </span>
                  )}
                </td>
                <td>{e.dir ? "" : size(e.size)}</td>
                <td>{e.modified ? new Date(e.modified * 1000).toLocaleString() : ""}</td>
                <td className="nh-actions">
                  <button
                    className="btn btn-small btn-icon"
                    title={`Rename ${e.name}`}
                    aria-label={`Rename ${e.name}`}
                    onClick={() => {
                      const name = window.prompt(`New name for ${e.name}`, e.name);
                      if (name?.trim() && name.trim() !== e.name) run(renameEntry(site.name, join(e.name), name.trim()), `Renamed to ${name.trim()}.`);
                    }}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    className="btn btn-small btn-icon btn-danger"
                    title={`Delete ${e.name}`}
                    aria-label={`Delete ${e.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete ${e.name}? It moves to C:\\NexDB\\nexhost\\.deleted, so you can get it back.`))
                        run(removeEntry(site.name, join(e.name)), `Deleted ${e.name}.`);
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
