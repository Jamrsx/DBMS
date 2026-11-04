import { invoke, pause } from "./invoke";
import { inDesktopApp } from "./scan";

export interface PhpExtension {
  name: string;
  enabled: boolean;
  /** On by default in NexDB. */
  default: boolean;
  note: string;
  /** Why it can't be turned on with this PHP, if it can't. */
  blocked: string | null;
}

export interface PhpSetting {
  key: string;
  value: string;
  default: string;
}

export interface PhpSettings {
  version: string;
  extensions: PhpExtension[];
  settings: PhpSetting[];
  own_lines: string;
  own_lines_used: boolean;
  ini: string;
}

// Browser preview: PHP 8.5 with its usual extensions.
const NOTES: Record<string, string> = {
  curl: "Lets PHP call other websites and APIs. Laravel's HTTP client needs it.",
  gd: "Resizes and edits images (thumbnails, captchas).",
  intl: "Dates, numbers and text in many languages. Laravel and Symfony use it.",
  mbstring: "Text in any language (UTF-8). Laravel and WordPress need it.",
  pdo_mysql: "MySQL for Laravel and most frameworks.",
  pdo_pgsql: "PostgreSQL databases.",
  soap: "Old-style SOAP web services.",
  sodium: "Modern encryption. Laravel uses it.",
  zip: "Reads and writes .zip files. Composer is faster with it.",
  xsl: "Transforms XML with XSLT.",
};
const previewOn = new Set(["curl", "gd", "intl", "mbstring", "pdo_mysql", "pdo_pgsql", "sodium", "zip"]);
const previewValues: Record<string, string> = {};
const preview = (version: string | null): PhpSettings => ({
  version: version ?? "8.5.12",
  extensions: Object.keys(NOTES)
    .sort()
    .map((name) => ({
      name,
      enabled: previewOn.has(name),
      default: ["curl", "gd", "intl", "mbstring", "pdo_mysql", "pdo_pgsql", "sodium", "zip"].includes(name),
      note: NOTES[name],
      blocked: null,
    })),
  settings: [
    ["memory_limit", "512M"],
    ["upload_max_filesize", "64M"],
    ["post_max_size", "64M"],
    ["max_execution_time", "120"],
    ["max_input_vars", "1000"],
    ["display_errors", "On"],
  ].map(([key, def]) => ({ key, default: def, value: previewValues[key] ?? def })),
  own_lines: `C:\\NexDB\\etc\\php-custom\\${version ?? "8.5.12"}.ini`,
  own_lines_used: false,
  ini: "C:\\NexDB\\etc\\php\\php.ini",
});

/** A PHP version's extensions and settings; null for NexDB's default PHP. */
export async function phpSettings(version: string | null): Promise<PhpSettings> {
  if (inDesktopApp) return invoke("php_settings_info", { version });
  await pause(200);
  return preview(version);
}

/** Saves the choices; PHP checks them first and running PHP restarts with them. */
export async function savePhpSettings(
  version: string | null,
  extensions: Record<string, boolean>,
  values: Record<string, string>,
): Promise<PhpSettings> {
  if (inDesktopApp) return invoke("php_settings_save", { version, extensions, values });
  await pause(900);
  for (const [k, on] of Object.entries(extensions)) {
    if (on) previewOn.add(k);
    else previewOn.delete(k);
  }
  Object.assign(previewValues, values);
  return preview(version);
}

/** Checks your own lines and restarts PHP with them. */
export async function applyPhpSettings(version: string | null): Promise<PhpSettings> {
  if (inDesktopApp) return invoke("php_settings_apply", { version });
  await pause(700);
  return preview(version);
}

/** Opens your own php.ini lines for this version in the PC's editor. */
export async function openPhpLines(version: string | null): Promise<void> {
  if (inDesktopApp) return invoke("php_settings_open", { version });
  await pause(200);
}
