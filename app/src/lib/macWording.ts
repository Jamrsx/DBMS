import { isMac } from "./os";
/**
 * macOS: NexDB's screens were written for Windows ("this PC", "Windows asks for your
 * permission", "Recycle Bin"). On a Mac this rewrites those phrases as text appears, in the
 * app's own labels and in messages from the Rust side alike. It never touches what the user or
 * a program wrote: code, logs, inputs, the terminal and anything marked `data-raw` stay as they are.
 */

const PHRASES: [RegExp, string][] = [
  [/Windows asks for your permission/g, "macOS asks for your password"],
  [/Windows asks for permission/g, "macOS asks for your password"],
  [/Windows asks you to confirm/g, "macOS asks for your password"],
  [/Windows will ask you to confirm/g, "macOS will ask for your password to confirm"],
  [/Windows asks once/g, "macOS asks for your password once"],
  [/Windows asks/g, "macOS asks"],
  [/Waiting for Windows/g, "Waiting for macOS"],
  [/until Windows knows them/g, "until the Mac knows them"],
  [/until Windows trusts it/g, "until the Mac trusts it"],
  [/Windows trusts/g, "the Mac trusts"],
  [/Windows Firewall/g, "the Mac's firewall"],
  [/Windows administrator/g, "Mac administrator"],
  [/As Windows has it/g, "As your Mac has it"],
  [/how Windows had it/g, "how your Mac had it"],
  [/Recycle Bin/g, "Trash"],
  [/File Explorer/g, "Finder"],
  [/Open in Explorer/g, "Show in Finder"],
  [/from Explorer/g, "from Finder"],
  [/\bcmd, PowerShell and/g, "Terminal, iTerm and"],
  [/\bPowerShell\b/g, "Terminal"],
  [/\bthis PC\b/g, "this Mac"],
  [/\bThis PC\b/g, "This Mac"],
  [/\byour PC\b/g, "your Mac"],
  [/\bon the PC\b/g, "on the Mac"],
  [/\bthe PC\b/g, "the Mac"],
  [/\bother PCs\b/g, "other computers"],
  [/C:\\Tools\\elasticsearch\\bin\\elasticsearch\.exe/g, "/usr/local/bin/elasticsearch"],
  // Shortcuts that follow ⌘ on a Mac (the Terminal's own Ctrl shortcuts stay Ctrl).
  [/Ctrl\+K\b/g, "⌘K"],
  [/Ctrl\+([0-9])\b/g, "⌘$1"],
  [/Ctrl\+Enter\b/g, "⌘Enter"],
  [/Ctrl\+S\b/g, "⌘S"],
];

/** `C:\NexDB\nexhost\my-shop` in examples reads `~/NexDB/nexhost/my-shop`. */
const NEXDB_PATH = /C:\\NexDB((?:\\[\w.{}"|-]*)*)/g;

/** Elements whose text belongs to the user or a program, not to NexDB. */
const RAW = "code, pre, textarea, input, select, kbd, samp, .xterm, [data-raw], [contenteditable]";

export function macWording(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PHRASES) out = out.replace(pattern, replacement);
  return out.replace(NEXDB_PATH, (_, rest: string) => `~/NexDB${rest.replace(/\\/g, "/")}`);
}

function fixNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || parent.closest(RAW)) return;
    const text = node.nodeValue ?? "";
    const fixed = macWording(text);
    if (fixed !== text) node.nodeValue = fixed;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (el.closest(RAW)) return;
  for (const attr of ["title", "aria-label", "placeholder"]) {
    const value = el.getAttribute(attr);
    if (value) {
      const fixed = macWording(value);
      if (fixed !== value) el.setAttribute(attr, fixed);
    }
  }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) fixNode(t);
}

/** For text the page can't show itself (window.confirm): Mac wording on a Mac. */
export function forThisOs(text: string): string {
  return isMac ? macWording(text) : text;
}

/** Starts rewriting on a Mac; call once at startup. */
export function startMacWording(root: HTMLElement) {
  fixNode(root);
  new MutationObserver((changes) => {
    for (const c of changes) {
      if (c.type === "characterData") fixNode(c.target);
      else if (c.type === "attributes") fixNode(c.target);
      else c.addedNodes.forEach(fixNode);
    }
  }).observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "placeholder"],
  });
}
