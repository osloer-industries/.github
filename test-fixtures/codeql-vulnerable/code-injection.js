/** Intentionally vulnerable fixture for live CodeQL gate tests (not scanned by default CI). */

export function runUserCode(userInput) {
  // eslint-disable-next-line no-eval
  return eval(userInput);
}
