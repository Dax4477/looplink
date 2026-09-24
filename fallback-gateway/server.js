const http = require("http");
const httpProxy = require("http-proxy");

const PORT = Number(process.env.PORT || 10000);
const UPSTREAM_HTTP =
  process.env.UPSTREAM_HTTP || "https://looplink-api.obserax.workers.dev";
const UPSTREAM_WS =
  process.env.UPSTREAM_WS || "wss://looplink-api.obserax.workers.dev";

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  xfwd: true,
  secure: true,
  ws: true,
  proxyTimeout: 30000,
  timeout: 30000,
});

proxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("x-looplink-gateway", "render-free-fallback-v0.1");
});

proxy.on("proxyReqWs", (proxyReq) => {
  proxyReq.setHeader("x-looplink-gateway", "render-free-fallback-v0.1");
});

proxy.on("error", (err, req, resOrSocket) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    event: "proxy_error",
    path: req?.url || "",
    message: err?.message || String(err),
  }));

  if (resOrSocket && typeof resOrSocket.writeHead === "function") {
    if (!resOrSocket.headersSent) {
      resOrSocket.writeHead(502, { "content-type": "application/json" });
    }
    resOrSocket.end(JSON.stringify({
      ok: false,
      service: "looplink-fallback-gateway",
      error: "upstream_unavailable",
    }));
    return;
  }

  try { resOrSocket?.destroy(); } catch {}
});

const server = http.createServer(async (req, res) => {
  if (req.url === "/fallback-health") {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({
      ok: true,
      service: "looplink-fallback-gateway",
      version: "0.1.0",
      upstream: UPSTREAM_HTTP,
    }));
    return;
  }

  if (req.url === "/fallback-upstream-health") {
    try {
      const response = await fetch(`${UPSTREAM_HTTP}/health`, {
        method: "GET",
        headers: { "user-agent": "looplink-fallback-gateway/0.1.0" },
        signal: AbortSignal.timeout(8000),
      });

      const body = await response.text();

      res.writeHead(response.status, {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch (err) {
      res.writeHead(502, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({
        ok: false,
        service: "looplink-fallback-gateway",
        error: "upstream_health_failed",
        message: String(err?.message || err),
      }));
    }
    return;
  }

  proxy.web(req, res, { target: UPSTREAM_HTTP });
});

server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, { target: UPSTREAM_WS });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "started",
    service: "looplink-fallback-gateway",
    version: "0.1.0",
    port: PORT,
    upstreamHttp: UPSTREAM_HTTP,
    upstreamWs: UPSTREAM_WS,
  }));
});
