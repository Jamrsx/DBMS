import { invoke } from "./invoke";
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
  /** Portable Git; null when the bundled catalog predates it. */
  git_version: string | null;
}

/**
 * Versions to offer. The app asks the official release sites (at most every 12 hours, or now
 * with `fresh`) and falls back to the list that came with NexDB when offline.
 */
export async function loadChoices(fresh = false): Promise<Choices> {
  if (inDesktopApp) {
    return invoke<Choices>("component_choices", { fresh });
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
