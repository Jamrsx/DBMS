import { invoke } from "./invoke";
import { inDesktopApp, realDesktopApp } from "./scan";
import { isPractice } from "./practice";
import type { ColumnInfo } from "./db";

export interface SchemaIndex {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
}

export interface SchemaTable {
  name: string;
  is_view: boolean;
  rows: number | null;
  columns: ColumnInfo[];
  indexes: SchemaIndex[];
}

/** A foreign key: table(columns) points at to_table(to_columns). */
export interface SchemaLink {
  name: string;
  table: string;
  columns: string[];
  to_table: string;
  to_columns: string[];
}

export interface Schema {
  database: string;
  engine: "mysql" | "postgres";
  tables: SchemaTable[];
  links: SchemaLink[];
  /** Some indexes or keys may be missing (a very large database). */
  partial: boolean;
}

export interface SchemaDiff {
  kind: "table" | "column" | "index" | "key";
  table: string;
  name: string;
  change: "only_a" | "only_b" | "different";
  a: string | null;
  b: string | null;
}

export const dbSchema = (name: string) =>
  inDesktopApp ? invoke<Schema>("db_schema", { name }) : Promise.resolve(sampleSchema(name));

export const dbCompare = (a: string, b: string) =>
  inDesktopApp ? invoke<SchemaDiff[]>("db_compare", { a, b }) : Promise.resolve(sampleCompare(a, b));

/**
 * Opens the diagram in a window of its own in the desktop app. In the browser preview and in
 * practice mode there's no second window, so it returns false and the page shows it in place.
 */
export async function openDiagramWindow(name: string): Promise<boolean> {
  if (!realDesktopApp || isPractice()) return false;
  await invoke("diagram_window", { name });
  return true;
}

const col = (name: string, column_type: string, key = "", nullable = false, extra = ""): ColumnInfo => ({
  name,
  column_type,
  nullable,
  key,
  default: null,
  extra,
});
const id = () => col("id", "bigint unsigned", "PRI", false, "auto_increment");
const pk = (): SchemaIndex => ({ name: "PRIMARY", columns: ["id"], unique: true, primary: true });
const fk = (table: string, column: string, to: string): SchemaLink => ({
  name: `${table}_${column}_foreign`,
  table,
  columns: [column],
  to_table: to,
  to_columns: ["id"],
});

/** The sample blog: users write posts, posts have comments and categories. */
function sampleSchema(name: string): Schema {
  const tables: SchemaTable[] = [
    {
      name: "users",
      is_view: false,
      rows: 12,
      columns: [
        id(),
        col("name", "varchar(255)"),
        col("email", "varchar(255)", "UNI"),
        col("created_at", "timestamp", "", true),
      ],
      indexes: [pk(), { name: "users_email_unique", columns: ["email"], unique: true, primary: false }],
    },
    {
      name: "posts",
      is_view: false,
      rows: 48,
      columns: [
        id(),
        col("user_id", "bigint unsigned", "MUL"),
        col("title", "varchar(255)"),
        col("body", "text", "", true),
        col("published_at", "timestamp", "", true),
      ],
      indexes: [pk(), { name: "posts_user_id_foreign", columns: ["user_id"], unique: false, primary: false }],
    },
    {
      name: "comments",
      is_view: false,
      rows: 230,
      columns: [
        id(),
        col("post_id", "bigint unsigned", "MUL"),
        col("user_id", "bigint unsigned", "MUL"),
        col("body", "text"),
      ],
      indexes: [pk()],
    },
    {
      name: "categories",
      is_view: false,
      rows: 6,
      columns: [id(), col("name", "varchar(80)"), col("slug", "varchar(80)", "UNI")],
      indexes: [pk()],
    },
    {
      name: "category_post",
      is_view: false,
      rows: 70,
      columns: [col("post_id", "bigint unsigned", "PRI"), col("category_id", "bigint unsigned", "PRI")],
      indexes: [{ name: "PRIMARY", columns: ["post_id", "category_id"], unique: true, primary: true }],
    },
    {
      name: "migrations",
      is_view: false,
      rows: 9,
      columns: [
        col("id", "int unsigned", "PRI", false, "auto_increment"),
        col("migration", "varchar(255)"),
        col("batch", "int"),
      ],
      indexes: [pk()],
    },
  ];
  // More of a real app, so there's something to organize.
  const more = (n: string, rows: number, cols: ColumnInfo[]): SchemaTable => ({
    name: n,
    is_view: false,
    rows,
    columns: [id(), ...cols],
    indexes: [pk()],
  });
  const ref = (c: string) => col(c, "bigint unsigned", "MUL");
  tables.push(
    more("tags", 14, [col("name", "varchar(60)")]),
    more("post_tag", 90, [ref("post_id"), ref("tag_id")]),
    more("likes", 400, [ref("user_id"), ref("post_id")]),
    more("follows", 52, [ref("follower_id"), ref("followed_id")]),
    more("profiles", 12, [ref("user_id"), col("bio", "text", "", true)]),
    more("media", 33, [ref("post_id"), col("path", "varchar(255)")]),
    more("notifications", 120, [ref("user_id"), col("data", "json")]),
    more("sessions", 4, [ref("user_id"), col("payload", "longtext")]),
    more("password_reset_tokens", 0, [col("email", "varchar(255)"), col("token", "varchar(255)")]),
  );
  const links = [
    fk("posts", "user_id", "users"),
    fk("comments", "post_id", "posts"),
    fk("comments", "user_id", "users"),
    fk("category_post", "post_id", "posts"),
    fk("category_post", "category_id", "categories"),
    fk("post_tag", "post_id", "posts"),
    fk("post_tag", "tag_id", "tags"),
    fk("likes", "user_id", "users"),
    fk("likes", "post_id", "posts"),
    fk("follows", "follower_id", "users"),
    fk("follows", "followed_id", "users"),
    fk("profiles", "user_id", "users"),
    fk("media", "post_id", "posts"),
    fk("notifications", "user_id", "users"),
    fk("sessions", "user_id", "users"),
  ];
  return { database: name, engine: "mysql", tables, links, partial: false };
}

function sampleCompare(a: string, b: string): SchemaDiff[] {
  if (a === b) return [];
  return [
    { kind: "table", table: "tags", name: "", change: "only_b", a: null, b: null },
    {
      kind: "column",
      table: "posts",
      name: "title",
      change: "different",
      a: "varchar(255), required",
      b: "varchar(120), required",
    },
    { kind: "column", table: "posts", name: "slug", change: "only_b", a: null, b: "varchar(255), required" },
    { kind: "column", table: "users", name: "phone", change: "only_a", a: "varchar(40), can be empty", b: null },
    {
      kind: "index",
      table: "posts",
      name: "posts_slug_unique",
      change: "only_b",
      a: null,
      b: "unique on slug",
    },
    {
      kind: "key",
      table: "comments",
      name: "comments_user_id_foreign",
      change: "only_a",
      a: "user_id → users(id)",
      b: null,
    },
  ];
}
