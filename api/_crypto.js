const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKeyMaterial() {
  const secret =
    process.env.WIDGET_CRYPTO_SECRET ||
    process.env.NOTION_OAUTH_CLIENT_SECRET ||
    process.env.NOTION_API_KEY;
  if (!secret) {
    throw new Error('WIDGET_CRYPTO_SECRET 또는 NOTION_OAUTH_CLIENT_SECRET 환경변수가 필요합니다.');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptPayload(obj) {
  const key = getKeyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const json = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const key = getKeyMaterial();
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

function extractWidgetKey(req) {
  if (req.query && typeof req.query.k === 'string' && req.query.k.trim()) {
    return req.query.k.trim();
  }
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const k = urlObj.searchParams.get('k');
    if (k && k.trim()) return k.trim();
  } catch {
    // ignore URL parse errors
  }
  const headerKey = req.headers && req.headers['x-widget-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  return '';
}

module.exports = {
  encryptPayload,
  decryptPayload,
  extractWidgetKey,
};
