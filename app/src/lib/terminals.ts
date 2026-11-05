import { invoke, pause } from "./invoke";
import { inDesktopApp } from "./scan";
import { onPractice } from "./practice";

export interface PhpInstall {
  dir: string;
  version: string;
  /** "NexDB", "Laragon", "XAMPP", "WAMP" or "Other". */
  source: string;
}

export interface OtherTerminals {
  installs: PhpInstall[];
  /** The PHP folder other terminals use now. */
  current_dir: string | null;
  /** The one picked here, while NexDB's folder is on PATH. */
  chosen_dir: string | null;
  shims_on_path: boolean;
}

// The browser preview and practice: a PC with NexDB's PHP and Laragon's.
const sample = (): OtherTerminals => ({
  installs: [
    { dir: "C:\\NexDB\\bin\\php\\php-8.5.12", version: "8.5.12", source: "NexDB" },
    { dir: "C:\\NexDB\\bin\\php\\php-8.4.27", version: "8.4.27", source: "NexDB" },
    { dir: "C:\\laragon\\bin\\php\\php-8.3.20-Win32-vs16-x64", version: "8.3.20", source: "Laragon" },
  ],
  current_dir: "C:\\laragon\\bin\\php\\php-8.3.20-Win32-vs16-x64",
  chosen_dir: null,
  shims_on_path: false,
});
let preview = sample();
onPractice(() => {
  preview = sample();
});

export async function otherTerminals(): Promise<OtherTerminals> {
  if (inDesktopApp) return invoke<OtherTerminals>("other_terminals_info");
  return { ...preview };
}

/** `dir` null: back to however Windows had it. */
export async function chooseOtherTerminals(dir: string | null): Promise<OtherTerminals> {
  if (inDesktopApp) return invoke<OtherTerminals>("other_terminals_choose", { dir });
  await pause(700);
  preview = dir
    ? { ...preview, current_dir: dir, chosen_dir: dir, shims_on_path: true }
    : { ...sample(), installs: preview.installs };
  return { ...preview };
}
