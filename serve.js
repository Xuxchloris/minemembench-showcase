#!/usr/bin/env node
/**
 * Zero-dependency static dev server for the MineMemBench public showcase.
 *
 *   npm run dev -- --port 7100 --host 127.0.0.1
 *
 * The same directory is the deployable artifact: any static host can serve it
 * verbatim (no build step, no runtime dependency).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.split("=")[1];
  return fallback;
}

const port = Number(arg("port", process.env.PORT || 7100));
const host = arg("host", "127.0.0.1");

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
});

server.listen(port, host, () => {
  console.log(`MineMemBench showcase → http://${host}:${port}/`);
});
