/**
 * Parses hostname from RCON "hostname" command response (e.g. "hostname = My Server").
 * @param {string} text - Raw RCON response text
 * @param {string} [fallback='–'] - Value when parsing fails or empty
 * @returns {string}
 */
function parseHostnameResponse(text, fallback = '–') {
  if (typeof text !== 'string') return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.includes('=') ? trimmed.split('=')[1].trim() : trimmed || fallback;
}

module.exports = { parseHostnameResponse };
