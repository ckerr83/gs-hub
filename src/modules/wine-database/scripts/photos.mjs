// Offline administrator tool only; never imported by the application.
// --verify is read-only; --upload inserts missing photos without overwrites.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
const [mode, flag, directory] = process.argv.slice(2);
if (
  !["--verify", "--upload"].includes(mode) ||
  flag !== "--from" ||
  !directory ||
  process.argv.length !== 5
)
  throw new Error(
    "Usage: node src/modules/wine-database/scripts/photos.mjs --verify|--upload --from .next/wine-import",
  );
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_MIGRATION_KEY;
if (!url || !key)
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and a temporary server-only SUPABASE_MIGRATION_KEY in this terminal. Never use NEXT_PUBLIC_ for privileged keys.",
  );
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const images = JSON.parse(
  await readFile(path.join(directory, "images.json"), "utf8"),
);
const manifest = JSON.parse(
  await readFile(path.join(directory, "manifest.json"), "utf8"),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (
  hash(await readFile(path.join(directory, "images.json"))) !==
    manifest.files["images.json"] ||
  images.length !== 81
)
  throw new Error("Manifest mismatch");
let verified = 0,
  uploaded = 0;
for (const item of images) {
  const local = await readFile(path.resolve(item.local_path));
  if (
    hash(local) !== item.sha256 ||
    local.length !== item.bytes ||
    item.storage_bucket !== "wine-bottles" ||
    !/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(item.storage_path)
  )
    throw new Error("Invalid local photo or manifest");
  let remote = await client.storage
    .from("wine-bottles")
    .download(item.storage_path);
  if (remote.error) {
    const code = String(remote.error.statusCode ?? remote.error.status);
    if (
      mode !== "--upload" ||
      !["404", "400"].includes(code) ||
      !["Object not found", "The resource was not found"].includes(
        remote.error.message,
      )
    )
      throw new Error(
        `Photo unavailable (${item.storage_path}); check bucket, access and upload status`,
      );
    const contentType = item.storage_path.endsWith("png")
      ? "image/png"
      : item.storage_path.endsWith("webp")
        ? "image/webp"
        : "image/jpeg";
    const result = await client.storage
      .from("wine-bottles")
      .upload(item.storage_path, local, { contentType, upsert: false });
    if (result.error)
      throw new Error(
        `Photo upload refused (${item.storage_path}); existing objects are never overwritten`,
      );
    uploaded++;
    remote = await client.storage
      .from("wine-bottles")
      .download(item.storage_path);
  }
  if (
    remote.error ||
    !remote.data ||
    hash(Buffer.from(await remote.data.arrayBuffer())) !== item.sha256
  )
    throw new Error(
      `Remote photo hash mismatch (${item.storage_path}); no overwrite attempted`,
    );
  verified++;
}
console.log(
  JSON.stringify({ mode, verified, uploaded, overwritten: 0 }, null, 2),
);
