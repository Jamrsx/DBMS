import { invoke } from "./invoke";
import { inDesktopApp } from "./scan";

export interface AppPlace {
  /** Running on a Mac. */
  mac: boolean;
  /** NexDB.app is in Applications (not the downloaded disk image). */
  in_applications: boolean;
}

/** Where NexDB runs from; on a Mac in Applications it also makes the shortcuts (once). */
export async function macAppPlace(): Promise<AppPlace> {
  if (inDesktopApp) return invoke("mac_app_place");
  return { mac: false, in_applications: true };
}

/** Copies NexDB to Applications and reopens it from there; this copy quits. */
export async function moveToApplications(): Promise<void> {
  if (inDesktopApp) return invoke("mac_move_to_applications");
}
