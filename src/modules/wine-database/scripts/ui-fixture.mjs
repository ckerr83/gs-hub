// Explicit UI test harness only. No production route imports this file.
// It proxies the running app but serves the recovered fixture through its own
// loopback-only API. All writes deliberately fail; no remote data is modified.
import http from "node:http";
import { readFile } from "node:fs/promises";
const moduleRoot = new URL("../", import.meta.url);
const { wines } = JSON.parse(
  await readFile(new URL("data/catalogue.json", moduleRoot), "utf8"),
);
const evidence = JSON.parse(
  await readFile(new URL("data/evidence.json", moduleRoot), "utf8"),
);
const port = Number(process.env.WINE_QA_PORT ?? 3101),
  target = process.env.WINE_QA_TARGET ?? "http://127.0.0.1:3000";
http
  .createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("X-GS-Hub-UI-Fixture", "true");
    if (url.pathname.startsWith("/api/wine-database")) {
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      if (request.method !== "GET") {
        response.writeHead(409);
        response.end(JSON.stringify({ error: "conflict" }));
        return;
      }
      const id = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      if (!id)
        response.end(
          JSON.stringify({
            wines: wines.map((w) => ({
              ...w,
              version: 1,
              updatedAt: "2026-11-13T00:00:00Z",
            })),
            canWrite: true,
          }),
        );
      else if (evidence[id]) response.end(JSON.stringify(evidence[id]));
      else {
        response.writeHead(404);
        response.end("null");
      }
      return;
    }
    const filename = url.pathname.match(
      /^\/(?:wine-database|wine-library)\/images\/([a-f0-9-]{36}\.png)$/,
    )?.[1];
    if (filename) {
      response.setHeader("Content-Type", "image/png");
      response.end(
        await readFile(new URL(`assets/images/${filename}`, moduleRoot)),
      );
      return;
    }
    const proxy = http.request(
      new URL(request.url, target),
      {
        method: request.method,
        headers: { ...request.headers, host: new URL(target).host },
      },
      (upstream) => {
        response.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(response);
      },
    );
    proxy.on("error", () => {
      response.writeHead(502);
      response.end("Start the application before the UI harness.");
    });
    request.pipe(proxy);
  })
  .listen(port, "127.0.0.1", () =>
    console.log(
      `UI FIXTURE ONLY: http://127.0.0.1:${port}; writes always fail; no Supabase connection.`,
    ),
  );
