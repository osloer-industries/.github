/** Minimal JavaScript for CodeQL reusable-workflow smoke (no security findings). */
function greet(name) {
  return `Hello, ${String(name)}`;
}

module.exports = { greet };
