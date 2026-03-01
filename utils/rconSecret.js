const crypto = require('crypto');

const ENC_PREFIX = 'enc:v1:';
const KEY_BYTES = 32;

function parseKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  try {
    const key = Buffer.from(trimmed, 'base64');
    if (key.length === KEY_BYTES) return key;
  } catch {
    // fall through
  }

  throw new Error('RCON_SECRET_KEY must be 32 bytes (hex-64 or base64-encoded)');
}

function getRconSecretKey() {
  return parseKey(process.env.RCON_SECRET_KEY);
}

function hasRconSecretKey() {
  return getRconSecretKey() !== null;
}

function isEncryptedRconSecret(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

function encryptRconSecret(plaintext) {
  const text = String(plaintext ?? '');
  const key = getRconSecretKey();
  if (!key) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decryptRconSecret(storedValue) {
  if (typeof storedValue !== 'string') return '';
  if (!isEncryptedRconSecret(storedValue)) return storedValue;

  const key = getRconSecretKey();
  if (!key) {
    throw new Error('RCON_SECRET_KEY is required to decrypt stored RCON passwords');
  }

  const payload = storedValue.slice(ENC_PREFIX.length);
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted RCON password format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

module.exports = {
  decryptRconSecret,
  encryptRconSecret,
  hasRconSecretKey,
  isEncryptedRconSecret,
};
