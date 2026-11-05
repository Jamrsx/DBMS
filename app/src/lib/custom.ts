import { invoke, pause } from "./invoke";
import { inDesktopApp } from "./scan";
import { onPractice } from "./practice";

export interface CustomService {
  id: string;
  name: string;
  exe: string;
  args: string;
  port: number;
}

export async function addCustomService(name: string, exe: string, args: string, port: number): Promise<void> {
  if (inDesktopApp) return invoke("custom_service_add", { name, exe, args, port });
  await pause(500);
  if (!name.trim()) throw "Give it a short name, like Search engine.";
  if (!/\.exe$/i.test(exe.trim())) throw "Pick the program's .exe file.";
  if (port < 1024 || port > 65535) throw "Use a port from 1024 to 65535.";
}

export async function removeCustomService(id: string): Promise<void> {
  if (inDesktopApp) return invoke("custom_service_remove", { id });
  await pause(300);
}

export async function pickCustomExe(): Promise<string | null> {
  if (inDesktopApp) return invoke<string | null>("custom_service_pick");
  return "C:\\Tools\\elasticsearch\\bin\\elasticsearch.exe";
}

/** The services you added, with whether each is running. */
export interface CustomShown {
  id: string;
  name: string;
  port: number;
  state: string;
}

let previewList: CustomShown[] = [];
// What you add in practice is gone when practice ends.
onPractice(() => {
  previewList = [];
});

export async function listCustomServices(): Promise<CustomShown[]> {
  if (inDesktopApp) {
    const { listServices } = await import("./services");
    return (await listServices())
      .filter((s) => s.id.startsWith("custom-"))
      .map((s) => ({ id: s.id, name: s.name, port: s.port, state: s.state }));
  }
  return previewList;
}

/** The browser preview keeps what you add until the page reloads. */
export function rememberPreview(name: string, port: number) {
  if (inDesktopApp) return;
  const id = `custom-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "service"
  }`;
  previewList = [...previewList.filter((s) => s.id !== id), { id, name: name.trim(), port, state: "stopped" }];
}

export function forgetPreview(id: string) {
  previewList = previewList.filter((s) => s.id !== id);
}
