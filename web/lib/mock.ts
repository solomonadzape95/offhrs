/**
 * Devnet mock naming.
 *
 * The devnet PreStock mocks are stand-ins for real assets, so showing them under
 * the real ticker is misleading. They carry an `off` prefix (`offSPACEX`) and the
 * UI says "devnet mock"; the underlying symbol is recovered when the page needs
 * to read the *real* reference market for context.
 */
export const MOCK_PREFIX = "off";

export const mockSymbol = (real: string) => `${MOCK_PREFIX}${real}`;

/** `offSPACEX` -> `SPACEX`; a real symbol passes through unchanged. */
export const underlyingSymbol = (symbol: string) =>
  symbol.startsWith(MOCK_PREFIX) ? symbol.slice(MOCK_PREFIX.length) : symbol;

export const isMock = (symbol: string) => symbol.startsWith(MOCK_PREFIX);
