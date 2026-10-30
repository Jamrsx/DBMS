import type { InstallPlan } from "../lib/plan";

interface Props {
  plan: InstallPlan;
  onEdit: (stepId: "welcome" | "components" | "mysql") => void;
}

export function Review({ plan, onEdit }: Props) {
  const adminSteps = plan.steps.filter((s) => s.admin).length;
  const confirmSteps = plan.steps.filter((s) => s.confirm).length;

  return (
    <>
      <p className="lede">
        Check everything before installing. Nothing has been changed on this PC yet.
      </p>

      <div className="review">
        <ReviewSection title="Folders" onEdit={() => onEdit("welcome")}>
          <dl className="facts">
            <dt>Install folder</dt>
            <dd>
              <code>{plan.installRoot}</code>
            </dd>
            <dt>Projects folder</dt>
            <dd>
              <code>{plan.wwwDir}</code>
            </dd>
          </dl>
        </ReviewSection>

        <ReviewSection title="Components" onEdit={() => onEdit("components")}>
          <ul className="plan-components">
            {plan.components.map((c) => (
              <li key={c.id}>
                <span className="plan-name">{c.name}</span>
                <span className="plan-action">
                  {c.action === "install"
                    ? `Install ${c.version ?? "latest stable"}`
                    : `Use existing ${c.version ?? ""}${c.source ? ` (${c.source})` : ""}`}
                </span>
                <code className="plan-path" title={c.path}>
                  {c.path}
                </code>
              </li>
            ))}
          </ul>
        </ReviewSection>

        {plan.mysql && (
          <ReviewSection title="MySQL" onEdit={() => onEdit("mysql")}>
            <dl className="facts">
              <dt>Port</dt>
              <dd>{plan.mysql.port}</dd>
              <dt>Root password</dt>
              <dd>{plan.mysql.hasPassword ? "Set (hidden)" : "None"}</dd>
              {plan.mysql.dataDir && (
                <>
                  <dt>Data folder</dt>
                  <dd>
                    <code>{plan.mysql.dataDir}</code>
                  </dd>
                </>
              )}
              {plan.mysql.mode === "new" && (
                <>
                  <dt>Start with DevManager</dt>
                  <dd>{plan.mysql.autostart ? "Yes" : "No"}</dd>
                </>
              )}
            </dl>
          </ReviewSection>
        )}

        <section aria-labelledby="steps-heading">
          <h2 id="steps-heading">What happens next</h2>
          <ol className="plan-steps">
            {plan.steps.map((s) => (
              <li key={s.id}>
                {s.title}
                {s.admin && <span className="tag tag-admin">Admin</span>}
                {s.confirm && <span className="tag tag-admin">Windows asks</span>}
              </li>
            ))}
          </ol>
          <p className="hint">
            {[
              adminSteps === 0
                ? "No administrator approval needed."
                : `${adminSteps} step${adminSteps > 1 ? "s" : ""} need${adminSteps > 1 ? "" : "s"} administrator approval.`,
              confirmSteps > 0 &&
                "Windows will ask you to confirm trusting the local certificate; it only covers .test and localhost.",
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </section>
      </div>
    </>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const id = `review-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        <button className="btn btn-quiet" onClick={onEdit} aria-label={`Edit ${title}`}>
          Edit
        </button>
      </div>
      <div className="review-box">{children}</div>
    </section>
  );
}
