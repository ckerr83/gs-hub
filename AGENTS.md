<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Module organization

- Keep this as one application in the original `gs-hub` project directory.
- Put each business module in `src/modules/<module-name>/`.
- Keep its components, styles, domain logic, server handlers, data, assets,
  database SQL, import scripts, tests and documentation inside that module.
- `src/app` files are thin Next.js route entry points that delegate to modules.
- Keep genuinely shared navigation, app-wide styles and Supabase infrastructure
  outside business modules. Do not place module-specific code in shared folders.
- Do not create sibling projects or duplicate a module's source in another folder.
- Preserve compatibility for stored IDs, local data keys, URLs and existing records
  when reorganizing. Update documentation and package scripts with moved files.
