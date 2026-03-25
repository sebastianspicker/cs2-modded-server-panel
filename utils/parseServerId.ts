import type { Request, Response } from 'express';

function parseServerId(val: string | number | null | undefined): string | null {
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

function requireServerId(req: Request, res: Response): string | null {
  const sid = parseServerId(req.body?.server_id);
  if (!sid) {
    res.status(400).json({ error: 'Missing or invalid server_id' });
    return null;
  }
  return sid;
}

export { parseServerId, requireServerId };
