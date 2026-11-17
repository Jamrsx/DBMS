import { invoke } from "./invoke";
import { inDesktopApp } from "./scan";

export interface UninstallInfo {
  /** The NexDB folder (null when NexDB isn't set up). */
  root: string | null;
  www: string | null;
  projects: number;
  databases: number;
  /** The projects folder is inside the NexDB folder, so deleting it deletes them too. */
  projects_inside: boolean;
}

export async function uninstallInfo(): Promise<UninstallInfo> {
  if (inDesktopApp) return invoke("uninstall_info");
  return { root: "/Users/you/NexDB", www: "/Users/you/NexDB/www", projects: 3, databases: 2, projects_inside: true };
}

/**
 * Uninstalls NexDB and quits. On a Mac it returns what couldn't be done (NexDB stays open then).
 * Preview: does nothing.
 */
export async function uninstallApp(deleteFolder: boolean): Promise<string[]> {
  if (inDesktopApp) return invoke("uninstall_app", { deleteFolder });
  return [];
}
