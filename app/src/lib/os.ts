/** Which OS the app runs on, and the path rules that differ (see docs/macos-port.md). */
export const isMac = typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);

/** Folder separator: `\` on Windows, `/` on macOS. */
export const SEP = isMac ? "/" : "\\";

/** "PC" or "Mac", for plain-language text. */
export const COMPUTER = isMac ? "Mac" : "PC";

/** Joins folder names with this OS's separator. */
export function joinPath(base: string, ...parts: string[]): string {
  return [base.replace(/[\\\/]+$/, ""), ...parts].join(SEP);
}

/** A full path for this OS: `C:\…` on Windows, `/…` on macOS. */
export function isFullPath(path: string): boolean {
  return isMac ? /^\/[^/]/.test(path) : /^[a-zA-Z]:\\[^\\]/.test(path);
}

/** Example install folder for hints when the real default isn't known yet. */
export const EXAMPLE_ROOT = isMac ? "/Users/you/NexDB" : "C:\\NexDB";
