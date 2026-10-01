// Shared with doctor: extending inspection must not weaken its existing checks.
export const SECRET_PATTERNS = [
  { name: "clave privada", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "token de GitHub", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "clave de acceso de AWS", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "asignación sensible",
    pattern: /\b(?:password|passwd|api[_-]?key|secret|token)\b\s*[:=]\s*["']?[^\s"'{}]{8,}/i
  }
];

export function containsSensitiveData(value) {
  return SECRET_PATTERNS.some(({ pattern }) => pattern.test(value))
    || /https?:\/\/[^\s/]+:[^\s/]+@/i.test(value)
    || /[?&](?:access_token|api_key|password|secret|token)=[^\s&#]+/i.test(value);
}

export function isCredentialPath(value) {
  return /(?:^|\/)(?:\.env(?:\.[^/]*)?|secrets?|credentials?|id_rsa|id_ed25519)(?:\/|$)/i.test(value)
    || /\.(?:pem|key|p12|pfx)$/i.test(value);
}
