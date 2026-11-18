import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync } from "node:fs";

registerHooks({
  load(url, context, next) {
    if (url.endsWith("/server/repository.ts")) return {
      format: "module",
      source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), { mode: "transform" }),
      shortCircuit: true,
    };
    return next(url, context);
  },
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "@/lib/supabase/server") return {
      url: "data:text/javascript,export async function createClient() { return globalThis.catalogueTestClient; }",
      shortCircuit: true,
    };
    try { return next(specifier, context); }
    catch (error) {
      if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier))
        return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { getWineDatabase } = await import("../server/repository.ts");

function fixture({ count = 123, cap = 500, changed = false, user = true, access = true, failCount = false } = {}) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: String(i).padStart(5, "0"), name: `Wine ${i}`, source_metadata: {} }));
  const calls = { auth: 0, count: 0, pages: 0, revision: 0, maxActive: 0, permission: [] };
  let active = 0;
  async function request(result) {
    active++; calls.maxActive = Math.max(calls.maxActive, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return result;
  }
  class Query {
    select(columns, options) { this.columns = columns; this.head = options?.head; return this; }
    is() { return this; }
    order() { return this; }
    limit() { return this; }
    gt(_column, after) { this.after = after; return this; }
    maybeSingle() {
      calls.revision++;
      return request({ data: { updated_at: changed && calls.revision > 1 ? "new" : "baseline" }, error: null });
    }
    then(resolve, reject) {
      let result;
      if (this.head) {
        calls.count++;
        result = { count: failCount ? null : count, error: failCount ? new Error("offline") : null };
      } else {
        calls.pages++;
        result = { data: rows.filter(row => this.after === undefined || row.id > this.after).slice(0, cap), error: null };
      }
      return request(result).then(resolve, reject);
    }
  }
  globalThis.catalogueTestClient = {
    auth: { getUser: async () => { calls.auth++; return { data: { user: user ? { id: "approved" } : null }, error: null }; } },
    rpc: async name => { calls.permission.push(name); return request({ data: access, error: null }); },
    from: () => new Query(),
  };
  return { rows, calls };
}
test("catalogue loads one page without an extra count or empty-page request", async () => {
  const { rows, calls } = fixture();
  const result = await getWineDatabase();
  assert.deepEqual(result.wines.map(wine => wine.id), rows.map(row => row.id));
  assert.equal(result.canWrite, true);
  assert.equal(calls.count, 1); assert.equal(calls.pages, 1); assert.equal(calls.revision, 2);
  assert.ok(calls.maxActive >= 3, "permission, count and starting revision should run together");
  assert.equal(calls.auth, 1);
  assert.deepEqual(calls.permission, ["wine_can_read", "wine_can_write"]);
});
test("server-side API row caps still return the complete catalogue with one count", async () => {
  const { rows, calls } = fixture({ count: 123, cap: 17 });
  const result = await getWineDatabase();
  assert.deepEqual(result.wines.map(wine => wine.id), rows.map(row => row.id));
  assert.equal(calls.count, 1); assert.equal(calls.pages, 8);
});
test("concurrent edits still invalidate a catalogue load", async () => {
  fixture({ changed: true });
  await assert.rejects(getWineDatabase(), error => error.code === "incomplete");
});
test("missing identity, denied membership and failed counts never return records", async () => {
  let f = fixture({ user: false });
  await assert.rejects(getWineDatabase(), error => error.code === "auth" && error.status === 401);
  assert.equal(f.calls.count + f.calls.pages, 0);
  f = fixture({ access: false });
  await assert.rejects(getWineDatabase(), error => error.code === "forbidden" && error.status === 403);
  assert.equal(f.calls.count + f.calls.pages, 0);
  f = fixture({ failCount: true });
  await assert.rejects(getWineDatabase(), error => error.code === "unavailable");
  assert.equal(f.calls.pages, 0);
});
