export async function createIdentityHash(cookie) {
  const identity = `${cookie.storeId}|${cookie.domain}|${cookie.path}|${cookie.name}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(identity);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32);
}

export function sanitizeInput(input, maxLength = 256) {
  if (!input) return '';
  let cleaned = String(input);
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return cleaned.replace(/[&<>"']/g, m => map[m]);
}

export function isIncognito(storeId) {
  return storeId === '1';
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}