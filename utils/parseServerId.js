/**
 * Returns valid server_id string or null if invalid.
 * @param {string|number|null|undefined} val
 * @returns {string|null}
 */
function parseServerId(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    return Number.isSafeInteger(val) && val > 0 ? String(val) : null;
  }
  const trimmed = String(val).trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return String(id);
}

/**
 * Parses server_id from req.body; sends 400 and returns null if invalid.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string|null}
 */
function requireServerId(req, res) {
  const sid = parseServerId(req.body?.server_id);
  if (!sid) {
    res.status(400).json({ error: 'Missing or invalid server_id' });
    return null;
  }
  return sid;
}

module.exports = { parseServerId, requireServerId };
