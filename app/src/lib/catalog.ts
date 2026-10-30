import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";
import previewChoices from "./preview-choices.json";

export type Label = "recommended" | "latest" | "lts" | "security-fix" | "ends-soon";

export interface VersionChoice {
  line: string;
  version: string;
  released: string | null;
  eol: string | null;
  labels: Label[];
  note: string | null;
  downloadable: boolean;
  download_size: number | null;
}

export interface ComponentChoices {
  id: string;
  name: string;
  versions: VersionChoice[];
  recommended: string | null;
}

export interface Choices {
  catalog_date: string;
  components: ComponentChoices[];
  composer_version: string;
}

export async function loadChoices(): Promise<Choices> {
  if (inDesktopApp) {
    return invoke<Choices>("component_choices");
  }
  // Browser preview: generated from the same Rust rules by
  // `cargo test write_preview_choices -- --ignored`.
  return previewChoices as Choices;
}

export const LABEL_TEXT: Record<Label, string> = {
  recommended: "Recommended",
  latest: "Latest",
  lts: "LTS",
  "security-fix": "Security fix",
  "ends-soon": "Ends soon",
};
