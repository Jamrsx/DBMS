import { invoke, pause } from "./invoke";
import { inDesktopApp } from "./scan";
import { onPractice } from "./practice";

export interface MailSummary {
  id: string;
  from: string;
  to: string[];
  subject: string;
  /** ISO 8601. */
  created: string;
  snippet: string;
  read: boolean;
  attachments: number;
}

export interface MailMessage {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string;
  html: string;
  text: string;
  attachments: string[];
}

export interface Inbox {
  messages: MailSummary[];
  total: number;
  unread: number;
}

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const sample = (): MailMessage[] => [
  {
    id: "m1",
    from: "Blog <noreply@blog.test>",
    to: ["ana@example.test"],
    cc: [],
    subject: "Reset your password",
    date: ago(2),
    html: '<div style="font-family:sans-serif;max-width:520px"><h2>Reset your password</h2><p>Hi Ana, someone asked to reset the password for your blog account.</p><p><a href="http://blog.test/reset/abc" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Choose a new password</a></p><p style="color:#666">If it wasn\'t you, you can ignore this email.</p></div>',
    text: "Hi Ana, someone asked to reset the password for your blog account.\n\nChoose a new password: http://blog.test/reset/abc",
    attachments: [],
  },
  {
    id: "m2",
    from: "Shop <orders@shop.test>",
    to: ["ben@example.test"],
    cc: ["sales@shop.test"],
    subject: "Your order #1042 is on its way",
    date: ago(45),
    html: '<div style="font-family:sans-serif"><h2>Thanks for your order!</h2><p>3 items are on their way.</p></div>',
    text: "Thanks for your order! 3 items are on their way.",
    attachments: ["invoice-1042.pdf"],
  },
  {
    id: "m3",
    from: "Blog <noreply@blog.test>",
    to: ["cleo@example.test"],
    cc: [],
    subject: "Welcome to the blog",
    date: ago(180),
    html: "<p>Welcome, Cleo! Your account is ready.</p>",
    text: "Welcome, Cleo! Your account is ready.",
    attachments: [],
  },
];
let previewMail = sample();
const previewRead = new Set<string>(["m3"]);
onPractice(() => {
  previewMail = sample();
  previewRead.clear();
  previewRead.add("m3");
});

export async function mailList(): Promise<Inbox> {
  if (inDesktopApp) return invoke<Inbox>("mail_list", { limit: 200 });
  const messages = previewMail.map((m) => ({
    id: m.id,
    from: m.from,
    to: m.to,
    subject: m.subject,
    created: m.date,
    snippet: m.text.slice(0, 80),
    read: previewRead.has(m.id),
    attachments: m.attachments.length,
  }));
  return { messages, total: messages.length, unread: messages.filter((m) => !m.read).length };
}

export async function mailGet(id: string): Promise<MailMessage> {
  if (inDesktopApp) return invoke<MailMessage>("mail_get", { id });
  await pause(150);
  previewRead.add(id);
  const m = previewMail.find((x) => x.id === id);
  if (!m) throw "That email doesn't exist any more.";
  return m;
}

/** Deletes the given emails, or all of them with an empty list. */
export async function mailDelete(ids: string[]): Promise<void> {
  if (inDesktopApp) return invoke("mail_delete", { ids });
  await pause(250);
  previewMail = ids.length ? previewMail.filter((m) => !ids.includes(m.id)) : [];
}
