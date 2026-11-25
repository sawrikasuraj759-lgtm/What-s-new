import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';

export const AUTHORIZED_ADMIN_EMAILS = [
  'sawrikasuraj9@gmail.com',
  'sawrikasuraj759@gmail.com',
  'epavenav@gmail.com',
];

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SECRET_FILE = path.resolve(DATA_DIR, '.yashi_auth_secret');
const FIREBASE_CONFIG_FILE = path.resolve(process.cwd(), 'firebase-applet-config.json');

let cachedProjectId = 'xenodochial-lead-ht3g1';
try {
  if (fs.existsSync(FIREBASE_CONFIG_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_FILE, 'utf-8'));
    if (parsed?.projectId) cachedProjectId = String(parsed.projectId);
  }
} catch {}

function getSigningSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
    return generated;
  } catch {
    return 'yashi-halls-ephemeral-fallback-secret-key-2026';
  }
}

const SIGNING_SECRET = getSigningSecret();

export interface AuthenticatedPrincipal {
  uid: string;
  email: string;
  username: string;
  isAdmin: boolean;
  firebaseVerified: boolean;
  provider: 'firebase' | 'session';
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache = { certs: {}, expiresAt: 0 };

function fetchGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache.expiresAt > now && Object.keys(certCache.certs).length > 0) {
    return Promise.resolve(certCache.certs);
  }
  return new Promise((resolve, reject) => {
    const url = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
    const req = https.get(url, { timeout: 6000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`Google cert fetch failed: ${res.statusCode}`));
          }
          const certs = JSON.parse(body);
          const cc = String(res.headers['cache-control'] || '');
          const maxAgeMatch = cc.match(/max-age=(\d+)/i);
          const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 3600 * 1000;
          certCache = { certs, expiresAt: Date.now() + ttlMs };
          resolve(certs);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Google cert fetch timeout'));
    });
  });
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64');
}

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return AUTHORIZED_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export async function verifyFirebaseIdToken(idToken: string): Promise<AuthenticatedPrincipal | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSig] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf-8'));
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf-8'));

    if (header.alg !== 'RS256' || !header.kid) return null;

    const certs = await fetchGoogleCerts();
    const cert = certs[header.kid];
    if (!cert) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();

    const sigBuf = base64UrlDecode(encodedSig);
    if (!verifier.verify(cert, sigBuf)) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.aud !== cachedProjectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${cachedProjectId}`) return null;
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;

    const email = String(payload.email || '').trim().toLowerCase();
    const firebaseVerified = Boolean(payload.email_verified);
    const username = String(payload.name || (email ? email.split('@')[0] : 'User'));

    return {
      uid: payload.sub,
      email,
      username,
      isAdmin: Boolean(email && isAuthorizedAdminEmail(email)),
      firebaseVerified,
      provider: 'firebase',
    };
  } catch {
    return null;
  }
}

export function issueSessionToken(data: {
  uid: string;
  email: string;
  username: string;
  firebaseVerified: boolean;
}): string {
  const cleanEmail = String(data.email || '').trim().toLowerCase();
  const payload = {
    uid: String(data.uid || '').trim(),
    email: cleanEmail,
    username: String(data.username || cleanEmail.split('@')[0] || 'User').slice(0, 80),
    firebaseVerified: Boolean(data.firebaseVerified),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SIGNING_SECRET).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function verifySessionToken(token: string): AuthenticatedPrincipal | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, sig] = parts;
    if (!encodedPayload || !sig) return null;

    const expectedSig = crypto.createHmac('sha256', SIGNING_SECRET).update(encodedPayload).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    if (!payload.uid || !payload.email) return null;

    const cleanEmail = String(payload.email).trim().toLowerCase();
    return {
      uid: String(payload.uid),
      email: cleanEmail,
      username: String(payload.username || cleanEmail.split('@')[0] || 'User'),
      isAdmin: isAuthorizedAdminEmail(cleanEmail),
      firebaseVerified: Boolean(payload.firebaseVerified),
      provider: 'session',
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string {
  const authHeader = String(req.headers['authorization'] || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  return '';
}

export async function resolveAuthPrincipal(req: Request): Promise<AuthenticatedPrincipal | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  const dotCount = (token.match(/\./g) || []).length;
  if (dotCount === 2) {
    return verifyFirebaseIdToken(token);
  }
  if (dotCount === 1) {
    return verifySessionToken(token);
  }
  return null;
}

export async function requireAuthenticatedUser(req: Request, res: Response, next: NextFunction) {
  const principal = await resolveAuthPrincipal(req);
  if (!principal) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in to continue.',
    });
  }
  (req as any).authPrincipal = principal;
  next();
}

export async function requireAuthorizedAdmin(req: Request, res: Response, next: NextFunction) {
  const principal = await resolveAuthPrincipal(req);
  if (!principal) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Valid admin authentication token is required.',
    });
  }
  if (!principal.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden. Authorized Master Admin permissions required.',
    });
  }
  (req as any).authPrincipal = principal;
  (req as any).adminEmail = principal.email;
  next();
}
