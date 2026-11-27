import { useEffect, useState } from "react";
import { MOVABLE_PORT, nextFreePort } from "../lib/ports";
import type { ServiceStatus } from "../lib/services";

/** What changes for the user once the service moves, in plain words. */
function afterMove(service: ServiceStatus, port: number): string {
  if (service.id === "apache" || service.id === "nginx") return `Your sites then open at localhost:${port}.`;
  if (service.id === "mysql") return `Your apps then connect to MySQL on port ${port}.`;
  return "Your sites keep working as before.";
}

/**
 * Offers the next free port when a service couldn't start because another program holds its
 * port: "Port 81 is free" and a "Yes, use port 81" button that saves it and starts the service.
 * Renders nothing for services whose port can't be changed, or while no free port is known.
 */
export function PortFix({
  service,
  services,
  busy,
  onUse,
}: {
  service: ServiceStatus;
  services: ServiceStatus[];
  busy: boolean;
  onUse: (port: number) => void;
}) {
  const [free, setFree] = useState<number | null>(null);
  const movable = !!service.port_taken && MOVABLE_PORT.includes(service.id);
  const others = services.map((s) => `${s.id}:${s.port}`).join(",");

  useEffect(() => {
    if (!movable) return;
    let current = true;
    nextFreePort(service, services)
      .then((port) => current && setFree(port))
      .catch(() => current && setFree(null));
    return () => {
      current = false;
    };
    // Look again only when the taken port or the other services' ports change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movable, service.id, service.port, others]);

  if (!movable || free === null) return null;
  return (
    <div className="port-fix" data-guide="port-fix">
      <span>
        Port {free} is free. Use it for {service.name} instead? NexDB saves it and starts {service.name}.{" "}
        {afterMove(service, free)}
      </span>
      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => onUse(free)}>
        Yes, use port {free}
      </button>
    </div>
  );
}
