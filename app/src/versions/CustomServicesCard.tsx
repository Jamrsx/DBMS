import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  addCustomService,
  forgetPreview,
  listCustomServices,
  pickCustomExe,
  rememberPreview,
  removeCustomService,
  type CustomShown,
} from "../lib/custom";
import { nexCelebrate } from "../lib/nex";

/**
 * Programs of your own that NexDB starts and stops with its services: a search engine, a queue
 * worker, any server. Each shows on the Dashboard under "Your own" and counts as running once it
 * answers on its port.
 */
export function CustomServicesCard({ active }: { active: boolean }) {
  const [list, setList] = useState<CustomShown[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [exe, setExe] = useState("");
  const [args, setArgs] = useState("");
  const [port, setPort] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    listCustomServices()
      .then(setList)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await addCustomService(name, exe, args, Number(port));
      rememberPreview(name, Number(port));
      nexCelebrate(`${name.trim()} is on the Dashboard now, under Your own.`);
      setAdding(false);
      setName("");
      setExe("");
      setArgs("");
      setPort("");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await removeCustomService(id);
      forgetPreview(id);
      setConfirm(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const portOk = /^\d{4,5}$/.test(port) && +port >= 1024 && +port <= 65535;
  return (
    <section className="set-card ver-card" data-guide="custom-services" aria-labelledby="custom-services-title">
      <div className="ver-head">
        <h3 id="custom-services-title">Your own services</h3>
      </div>
      <p className="set-lede ver-about">
        Any other program NexDB should start and stop with the rest, like a search engine or a queue worker. It shows on
        the Dashboard and counts as running once it answers on its port.
      </p>

      {list.length > 0 && (
        <ul className="ver-list custom-list">
          {list.map((s) => (
            <li key={s.id} className="ver-row">
              <span className="ver-num">{s.name}</span>
              <span className="ver-labels">
                <span className="kind">port {s.port}</span>
              </span>
              {confirm === s.id ? (
                <span className="inbox-confirm" role="alert">
                  Remove {s.name}? It stops first.
                  <button className="btn btn-small" onClick={() => setConfirm(null)}>
                    Keep
                  </button>
                  <button className="btn btn-small btn-danger" disabled={busy} onClick={() => void remove(s.id)}>
                    Remove
                  </button>
                </span>
              ) : (
                <button
                  className="btn btn-small btn-icon"
                  aria-label={`Remove ${s.name}`}
                  title="Remove"
                  onClick={() => setConfirm(s.id)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="custom-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label className="field">
            <span className="field-label">Name</span>
            <input value={name} placeholder="Search engine" maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field custom-exe">
            <span className="field-label">Program</span>
            <span className="custom-pick">
              <input
                value={exe}
                placeholder="C:\Tools\elasticsearch\bin\elasticsearch.exe"
                spellCheck={false}
                onChange={(e) => setExe(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void pickCustomExe().then((p) => p && setExe(p))}
              >
                Choose…
              </button>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Arguments (optional)</span>
            <input value={args} placeholder="-p 9200" spellCheck={false} onChange={(e) => setArgs(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Port it answers on</span>
            <input
              inputMode="numeric"
              value={port}
              placeholder="9200"
              aria-invalid={port !== "" && !portOk}
              onChange={(e) => setPort(e.target.value.trim())}
            />
            {port !== "" && !portOk && <span className="field-error">Use a number from 1024 to 65535.</span>}
          </label>
          <div className="set-row-actions">
            <button
              className="btn btn-primary btn-small"
              type="submit"
              disabled={busy || !name.trim() || !exe.trim() || !portOk}
              data-working={busy || undefined}
            >
              {busy ? "Adding…" : "Add it"}
            </button>
            <button type="button" className="btn btn-small" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="set-row-actions">
          <button className="btn btn-small" onClick={() => setAdding(true)} data-guide="custom-add">
            <Plus size={13} aria-hidden="true" /> Add a service
          </button>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
