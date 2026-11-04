import type { ColumnInfo, DbEngine } from "./db";

/** A ready-made SQL statement, filled in with the table and columns the user is looking at. */
export interface SqlTemplate {
  id: string;
  label: string;
  /** What it does, in plain words. */
  help: string;
  sql: string;
  /** Changes or removes data or tables. */
  danger?: boolean;
}

export interface TemplateGroup {
  label: string;
  templates: SqlTemplate[];
}

/** Plain words for a column type, for people who don't read SQL types yet. */
export function plainType(c: Pick<ColumnInfo, "column_type">): string {
  const t = c.column_type.toLowerCase();
  const size = t.match(/\((\d+)\)/)?.[1];
  if (t.startsWith("tinyint(1)") || t === "boolean" || t === "bool") return "Yes or no (1 or 0)";
  if (/^(tiny|small|medium|big)?int/.test(t))
    return t.includes("unsigned") ? "Whole number, 0 or more" : "Whole number";
  if (/^(decimal|numeric)/.test(t)) return "Number with decimals";
  if (/^(float|double|real)/.test(t)) return "Number with decimals";
  if (t.startsWith("varchar") || t.startsWith("char")) return size ? `Text, up to ${size} characters` : "Text";
  if (/text$/.test(t)) return "Long text";
  if (t === "date") return "Date (YYYY-MM-DD)";
  if (/^(datetime|timestamp)/.test(t)) return "Date and time";
  if (t === "time") return "Time (HH:MM:SS)";
  if (t === "year") return "Year";
  if (t.startsWith("enum")) return `One of: ${enumValues(t).join(", ")}`;
  if (t === "json") return "JSON data";
  if (/blob|binary/.test(t)) return "File or binary data";
  return c.column_type;
}

/** The choices of an enum column: enum('a','b') -> [a, b]. */
export function enumValues(columnType: string): string[] {
  const inner = columnType.match(/^enum\((.*)\)$/i)?.[1] ?? "";
  return [...inner.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

/** A sample value for a column, as SQL. */
function sample(c: ColumnInfo): string {
  const t = c.column_type.toLowerCase();
  if (t.startsWith("tinyint(1)")) return "1";
  if (/int|decimal|numeric|float|double|real|year/.test(t))
    return /decimal|numeric|float|double/.test(t) ? "0.00" : "1";
  if (t === "date") return "'2026-01-31'";
  if (/^(datetime|timestamp)/.test(t)) return "NOW()";
  if (t === "time") return "'12:00:00'";
  if (t.startsWith("enum")) return `'${enumValues(t)[0] ?? ""}'`;
  if (t === "json") return "'{}'";
  if (c.name.toLowerCase().includes("email")) return "'someone@example.com'";
  return `'${c.name.replace(/_/g, " ")}'`;
}

/** Templates for the current database and table (both optional), for MySQL or PostgreSQL. */
export function sqlTemplates(
  db: string | null,
  table: string | null,
  cols: ColumnInfo[],
  engine: DbEngine = "mysql",
): TemplateGroup[] {
  const pg = engine === "postgres";
  // MySQL quotes names with backticks, PostgreSQL with double quotes.
  const q = (name: string) => (pg ? `"${name}"` : `\`${name}\``);
  const t = q(table ?? "your_table");
  const key = cols.find((c) => c.key === "PRI")?.name ?? "id";
  const writable = cols.filter((c) => !c.extra.includes("auto_increment") && !/generated/i.test(c.extra));
  const firstText = cols.find((c) => /char|text/i.test(c.column_type))?.name ?? "name";
  const someCols =
    cols.length > 0
      ? cols
          .slice(0, 4)
          .map((c) => q(c.name))
          .join(", ")
      : `${q("id")}, ${q("name")}`;
  const updatable = writable.find((c) => c.key !== "PRI") ?? writable[0];
  const sorted = cols.find((c) => c.name === "created_at")?.name ?? key;
  const foreign = cols.find((c) => c.name !== key && c.name.endsWith("_id"));

  const look: SqlTemplate[] = [
    {
      id: "select",
      label: "Show rows",
      help: "Shows the first 100 rows of the table.",
      sql: `SELECT * FROM ${t}\nLIMIT 100;`,
    },
    {
      id: "find",
      label: "Find rows",
      help: "Shows only the rows that match. Change the value after = to what you're looking for.",
      sql: `SELECT ${someCols}\nFROM ${t}\nWHERE ${q(firstText)} = 'value';`,
    },
    {
      id: "search",
      label: "Search text",
      help: "Finds rows where the text contains a word. % means 'anything here'.",
      sql: `SELECT * FROM ${t}\nWHERE ${q(firstText)} LIKE '%word%';`,
    },
    {
      id: "count",
      label: "Count rows",
      help: "Tells you how many rows the table has.",
      sql: `SELECT COUNT(*) AS total FROM ${t};`,
    },
    {
      id: "newest",
      label: "Newest first",
      help: "Shows the 10 most recent rows, newest at the top.",
      sql: `SELECT * FROM ${t}\nORDER BY ${q(sorted)} DESC\nLIMIT 10;`,
    },
  ];
  if (foreign) {
    const other = foreign.name.replace(/_id$/, "");
    look.push({
      id: "join",
      label: "Join tables",
      help: `Shows rows together with their matching ${other}. Change ${other}s if the other table has a different name.`,
      sql: `SELECT ${t}.*, ${q(other + "s")}.*\nFROM ${t}\nJOIN ${q(other + "s")} ON ${q(other + "s")}.${q("id")} = ${t}.${q(foreign.name)}\nLIMIT 100;`,
    });
  }

  const insertCols = writable.length > 0 ? writable : [{ name: "name", column_type: "varchar(255)" } as ColumnInfo];
  const change: SqlTemplate[] = [
    {
      id: "insert",
      label: "Add a row",
      help: "Adds one row. Replace the sample values with yours; text goes in 'quotes'.",
      sql: `INSERT INTO ${t} (${insertCols.map((c) => q(c.name)).join(", ")})\nVALUES (${insertCols.map(sample).join(", ")});`,
    },
    {
      id: "update",
      label: "Change a row",
      help: "Changes only the row whose key matches. Keep the WHERE line, or every row changes.",
      danger: true,
      sql: `-- Changes only the row with ${key} = 1. Without WHERE, every row would change.\nUPDATE ${t}\nSET ${q(updatable?.name ?? "name")} = ${updatable ? sample(updatable) : "'new value'"}\nWHERE ${q(key)} = 1;`,
    },
    {
      id: "delete",
      label: "Delete a row",
      help: "Deletes only the row whose key matches. Keep the WHERE line, or every row is deleted.",
      danger: true,
      sql: `-- Deletes only the row with ${key} = 1. Without WHERE, every row would be deleted.\nDELETE FROM ${t}\nWHERE ${q(key)} = 1;`,
    },
  ];

  const tables: SqlTemplate[] = [
    {
      id: "create",
      label: "Make a table",
      help: "Makes a new table with an id, a name and timestamps. Rename it and its columns to fit.",
      sql: pg
        ? 'CREATE TABLE "posts" (\n  "id" BIGSERIAL PRIMARY KEY,\n  "title" VARCHAR(255) NOT NULL,\n  "body" TEXT NULL,\n  "created_at" TIMESTAMPTZ NULL DEFAULT now(),\n  "updated_at" TIMESTAMPTZ NULL DEFAULT now()\n);'
        : "CREATE TABLE `posts` (\n  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  `title` VARCHAR(255) NOT NULL,\n  `body` TEXT NULL,\n  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,\n  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP\n);",
    },
    {
      id: "add-column",
      label: "Add a column",
      help: "Adds a new column to the table. Existing rows get NULL in it.",
      sql: `ALTER TABLE ${t}\nADD COLUMN ${q("phone")} VARCHAR(30) NULL;`,
    },
    {
      id: "rename-column",
      label: "Rename a column",
      help: "Gives a column a new name; its data stays.",
      sql: `ALTER TABLE ${t}\nRENAME COLUMN ${q(firstText)} TO ${q("new_name")};`,
    },
    {
      id: "index",
      label: "Speed up a search",
      help: "Adds an index, so finding rows by this column gets faster on big tables.",
      sql: `CREATE INDEX ${q(`idx_${(table ?? "table").replace(/\W/g, "")}_${firstText}`)}\nON ${t} (${q(firstText)});`,
    },
    {
      id: "describe",
      label: "Show columns",
      help: "Lists the table's columns and their types.",
      sql: pg
        ? `SELECT column_name, data_type, is_nullable, column_default\nFROM information_schema.columns\nWHERE table_name = '${(table ?? "your_table").replace(/'/g, "''")}'\nORDER BY ordinal_position;`
        : `DESCRIBE ${t};`,
    },
    {
      id: "tables",
      label: "List tables",
      help: "Lists every table in this database.",
      sql: pg ? "SELECT tablename FROM pg_tables\nWHERE schemaname = 'public'\nORDER BY tablename;" : "SHOW TABLES;",
    },
    {
      id: "truncate",
      label: "Empty a table",
      help: "Deletes every row but keeps the table. This can't be undone.",
      danger: true,
      sql: `-- Deletes EVERY row in ${table ?? "the table"} and can't be undone. Back it up first.\nTRUNCATE TABLE ${t};`,
    },
    {
      id: "drop-table",
      label: "Delete a table",
      help: "Deletes the table and all its rows. This can't be undone.",
      danger: true,
      sql: `-- Deletes the whole table ${table ?? ""} and its rows. Back it up first.\nDROP TABLE ${t};`,
    },
  ];

  const databases: SqlTemplate[] = [
    {
      id: "show-dbs",
      label: "List databases",
      help: `Lists every database on this ${pg ? "PostgreSQL" : "MySQL"}.`,
      sql: pg ? "SELECT datname FROM pg_database\nWHERE NOT datistemplate\nORDER BY datname;" : "SHOW DATABASES;",
    },
    {
      id: "create-db",
      label: "Make a database",
      help: "Makes a new, empty database that stores any language and emoji.",
      sql: pg
        ? `CREATE DATABASE ${q("my_app")}\n  ENCODING 'UTF8' TEMPLATE template0;`
        : "CREATE DATABASE `my_app`\n  CHARACTER SET utf8mb4\n  COLLATE utf8mb4_unicode_ci;",
    },
    {
      id: "size",
      label: "Table sizes",
      help: "Shows how many rows and how much space each table in this database uses.",
      sql: pg
        ? `SELECT relname AS "table", reltuples::bigint AS "rows",\n  pg_total_relation_size(oid) / 1024 AS kb\nFROM pg_class\nWHERE relkind = 'r' AND relnamespace = 'public'::regnamespace\nORDER BY kb DESC;`
        : `SELECT TABLE_NAME AS \`table\`, TABLE_ROWS AS \`rows\`,\n  ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024) AS kb\nFROM information_schema.TABLES\nWHERE TABLE_SCHEMA = ${db ? `'${db.replace(/'/g, "''")}'` : "DATABASE()"}\nORDER BY kb DESC;`,
    },
  ];

  return [
    { label: "Look at data", templates: look },
    { label: "Change data", templates: change },
    { label: "Tables", templates: tables },
    { label: "Databases", templates: databases },
  ];
}

/** UPDATE or DELETE with no WHERE: it would touch every row. */
export function touchesEveryRow(sql: string): boolean {
  const statements = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  return statements.some((s) => /^(update|delete)\b/i.test(s) && !/\bwhere\b/i.test(s));
}
