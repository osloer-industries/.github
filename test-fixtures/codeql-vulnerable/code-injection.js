/** Intentionally vulnerable fixture for live CodeQL gate tests (isolated by analysis-paths). */
const http = require("node:http");
const { exec } = require("node:child_process");

http.createServer((req, res) => {
  exec(req.url);
  res.end("ok");
}).listen(0);
