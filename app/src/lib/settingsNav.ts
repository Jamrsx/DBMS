/** The parts of the Settings page, in the order its side list shows them. */
export const SETTINGS_SECTIONS = ["general", "web", "sharing", "backups", "updates", "tutorial"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Opens one part of Settings (Nex's tours use it to show a setting that lives there). */
export function showSettingsSection(section: SettingsSection) {
  window.dispatchEvent(new CustomEvent("nexdb:settings-section", { detail: section }));
}
