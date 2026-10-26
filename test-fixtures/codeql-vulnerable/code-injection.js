/** Intentionally vulnerable fixture for live CodeQL gate tests (isolated by analysis-paths). */
const { exec } = require("node:child_process");

function runUserCommand(userCommand) {
  exec(userCommand);
}

module.exports = { runUserCommand };
