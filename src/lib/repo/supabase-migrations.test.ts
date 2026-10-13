/**
 * Static checks of supabase/migrations. They read the SQL text; nothing here
 * runs against a database. They guard one rule: a browser client (anon key and
 * a user's JWT) may never write books, pages or book media directly, because
 * that would skip the "published book is locked for its owner" rule and every
 * other check the server applies.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

/** All migrations in the order they are applied, without comments. */
function migrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"))
    .join("\n")
    .replace(/--.*$/gm, "");
}

function statements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

const PROTECTED_TABLES = ["public.books", "public.pages", "storage.objects"];
const BROWSER_ROLES = /\b(anon|authenticated|public)\b/;

describe("supabase migrations: book content is written by the server only", () => {
  const all = statements(migrationsSql());

  it("leaves no insert / update / delete policy on books, pages or storage objects", () => {
    const live = new Map<string, string>();
    for (const statement of all) {
      const created = /^create policy (\w+) on ([\w.]+) for (\w+)/.exec(statement);
      if (created) live.set(`${created[2]}:${created[1]}`, created[3]);
      const dropped = /^drop policy (?:if exists )?(\w+) on ([\w.]+)/.exec(statement);
      if (dropped) live.delete(`${dropped[2]}:${dropped[1]}`);
    }
    // The fixture is being parsed at all.
    expect(live.get("public.books:books_select")).toBe("select");

    const writable = [...live.entries()]
      .filter(([key, command]) => PROTECTED_TABLES.includes(key.split(":")[0]) && command !== "select")
      .map(([key]) => key);
    expect(writable).toEqual([]);
  });

  it("ends with the write privileges on books and pages revoked from browser roles", () => {
    for (const table of ["public.books", "public.pages"]) {
      let granted = false;
      let sawGrant = false;
      for (const statement of all) {
        const grant = /^grant (.+?) on (.+?) to (.+)$/.exec(statement);
        if (grant && grant[2].includes(table) && BROWSER_ROLES.test(grant[3]) && /insert|update|delete|all/.test(grant[1])) {
          granted = true;
          sawGrant = true;
        }
        const revoke = /^revoke (.+?) on (.+?) from (.+)$/.exec(statement);
        if (
          revoke &&
          revoke[2].includes(table) &&
          /\banon\b/.test(revoke[3]) &&
          /\bauthenticated\b/.test(revoke[3]) &&
          (/\ball\b/.test(revoke[1]) || ["insert", "update", "delete"].every((command) => revoke[1].includes(command)))
        ) {
          granted = false;
        }
      }
      // The first migration did grant it; the check is only meaningful if that was seen.
      expect(sawGrant).toBe(true);
      expect(granted).toBe(false);
    }
  });

  it("ends with replace_book_pages() not executable by browser roles", () => {
    let executable = true;
    for (const statement of all) {
      if (!statement.includes("function public.replace_book_pages(")) continue;
      const grant = /^grant execute on .+? to (.+)$/.exec(statement);
      if (grant && BROWSER_ROLES.test(grant[1])) executable = true;
      const revoke = /^revoke execute on .+? from (.+)$/.exec(statement);
      if (revoke && /\bpublic\b/.test(revoke[1]) && /\banon\b/.test(revoke[1]) && /\bauthenticated\b/.test(revoke[1])) {
        executable = false;
      }
    }
    expect(executable).toBe(false);
  });
});
