/**
 * SecureStore — HMAC-SHA256 wrapped localStorage.
 *
 * Reality: a determined attacker with DevTools can still read the key from the
 * bundle and re-sign forged payloads. The point is to defeat trivial tampering
 * (manual edit of localStorage values, "score=999999" tools, copy-paste
 * leaderboard injection) — not state-level adversaries.
 *
 * Layout per key:  base64( JSON.stringify(payload) ) + "." + base64( HMAC )
 * Tampered or unsigned entries are silently dropped on read.
 */

const SUBTLE: SubtleCrypto | undefined =
  typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : undefined;

// Key material is split + xor'd at runtime so it doesn't sit as a single
// readable string in the bundle. Not real secrecy — just friction.
const _K_PARTS = [
  [0x53, 0x43, 0x52, 0x41, 0x50, 0x2d, 0x41, 0x52],
  [0x45, 0x4e, 0x41, 0x2d, 0x46, 0x52, 0x41, 0x43],
  [0x54, 0x55, 0x52, 0x45, 0x2d, 0x76, 0x31, 0x2e],
  [0x30, 0x2d, 0x69, 0x6e, 0x74, 0x67, 0x72, 0x74],
];

function _deriveKeyBytes(): Uint8Array {
  const out = new Uint8Array(_K_PARTS.length * 8);
  for (let i = 0; i < _K_PARTS.length; i++) {
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = _K_PARTS[i][j] ^ ((i * 31 + j * 17) & 0xff);
    }
  }
  return out;
}

let _cryptoKey: Promise<CryptoKey> | null = null;
function _getKey(): Promise<CryptoKey> {
  if (!SUBTLE) return Promise.reject(new Error("crypto.subtle unavailable"));
  if (!_cryptoKey) {
    _cryptoKey = SUBTLE.importKey(
      "raw",
      _bs(_deriveKeyBytes()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return _cryptoKey;
}

function _b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function _b64decode(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function _utf8(s: string): Uint8Array { return new TextEncoder().encode(s); }
function _utf8d(b: Uint8Array): string { return new TextDecoder().decode(b); }

// TS lib.dom recently narrowed BufferSource to require ArrayBuffer-backed views.
// Our buffers are always plain ArrayBuffer, but TS infers ArrayBufferLike — cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _bs = (u: Uint8Array): any => u;

function _ctEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Synchronous fallback HMAC (FNV-1a over key||payload). Used only when
 * SubtleCrypto is unavailable (very old browsers, file://). Weak, but better
 * than no integrity check at all and never returns a tampered value.
 */
function _fallbackMac(payload: string): string {
  const k = _deriveKeyBytes();
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xcbf29ce4 >>> 0;
  for (let i = 0; i < k.length; i++) { h1 = ((h1 ^ k[i]) * 16777619) >>> 0; h2 = ((h2 ^ k[i]) * 1099511628) >>> 0; }
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = ((h1 ^ (c & 0xff)) * 16777619) >>> 0;
    h2 = ((h2 ^ ((c >> 8) & 0xff)) * 1099511628) >>> 0;
  }
  return ("00000000" + h1.toString(16)).slice(-8) + ("00000000" + h2.toString(16)).slice(-8);
}

export const SecureStore = {
  /** Store a JSON-serialisable value under `key` with an HMAC tag. */
  async set(key: string, value: unknown): Promise<void> {
    if (typeof localStorage === "undefined") return;
    try {
      const payload = JSON.stringify(value);
      const payloadB64 = _b64encode(_utf8(payload));
      let mac: string;
      if (SUBTLE) {
        const k = await _getKey();
        const sig = new Uint8Array(await SUBTLE.sign("HMAC", k, _bs(_utf8(payload))));
        mac = _b64encode(sig);
      } else {
        mac = _fallbackMac(payload);
      }
      localStorage.setItem(key, `${payloadB64}.${mac}`);
    } catch { /* quota / serialise errors — silent */ }
  },

  /** Read & verify. Returns null if missing or tampered. */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const dot = raw.lastIndexOf(".");
    if (dot < 0) { localStorage.removeItem(key); return null; }
    const payloadB64 = raw.slice(0, dot);
    const macStr = raw.slice(dot + 1);
    try {
      const payloadBytes = _b64decode(payloadB64);
      const payload = _utf8d(payloadBytes);
      let ok = false;
      if (SUBTLE) {
        const k = await _getKey();
        const expected = new Uint8Array(await SUBTLE.sign("HMAC", k, _bs(payloadBytes)));
        const provided = _b64decode(macStr);
        ok = _ctEqual(expected, provided);
      } else {
        ok = macStr === _fallbackMac(payload);
      }
      if (!ok) { localStorage.removeItem(key); return null; }
      return JSON.parse(payload) as T;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  },

  /** Synchronous best-effort read using the fallback MAC only.
   *  Use when await is impossible (e.g. inside a sync constructor); SubtleCrypto
   *  entries cannot be verified this way and will return null. */
  getSyncFallback<T = unknown>(key: string): T | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const dot = raw.lastIndexOf(".");
    if (dot < 0) return null;
    const payloadB64 = raw.slice(0, dot);
    const macStr = raw.slice(dot + 1);
    try {
      const payload = _utf8d(_b64decode(payloadB64));
      if (macStr !== _fallbackMac(payload)) return null;
      return JSON.parse(payload) as T;
    } catch { return null; }
  },

  remove(key: string): void {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },

  /** UNVERIFIED synchronous peek — for non-trust-sensitive UI hints only.
   *  Returns the decoded payload regardless of MAC validity. Never use this
   *  to drive game logic, scoring, or wallet signing. */
  peekUnverified<T = unknown>(key: string): T | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const dot = raw.lastIndexOf(".");
      const body = dot > 0 ? atob(raw.slice(0, dot)) : raw;
      return JSON.parse(body) as T;
    } catch { return null; }
  },
};
