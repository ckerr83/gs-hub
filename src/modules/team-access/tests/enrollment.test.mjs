import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("first-account SQL requires an invited Auth user and enrolls only the approved email", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create schema auth; create table auth.users(id uuid primary key,email text); create schema wine_private; create table wine_private.team_access(user_id uuid primary key references auth.users(id),can_write boolean default false,approved_at timestamptz default now());",
    );
    const sql = readFileSync(
      new URL("../database/approve-chris.sql", import.meta.url),
      "utf8",
    );
    await assert.rejects(db.exec(sql), /Invite chris@gsimport.co.th/);
    await db.exec("rollback;");
    assert.equal(
      (await db.query("select count(*)::int as n from auth.users")).rows[0].n,
      0,
    );
    await db.exec(
      "insert into auth.users values ('11111111-1111-1111-1111-111111111111','CHRIS@GSIMPORT.CO.TH'),('22222222-2222-2222-2222-222222222222','another@example.com');",
    );
    await db.exec(sql);
    await db.exec(sql);
    assert.deepEqual(
      (await db.query("select user_id,can_write from wine_private.team_access"))
        .rows,
      [{ user_id: "11111111-1111-1111-1111-111111111111", can_write: true }],
    );
  } finally {
    await db.close();
  }
});
