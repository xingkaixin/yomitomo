import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';

const PAIRING_FILE_NAME = 'pairing.json';

export type PairingInfo = {
  token: string;
  pairingId: string;
  updatedAt: string;
};

function pairingFilePath() {
  return join(app.getPath('userData'), PAIRING_FILE_NAME);
}

export async function getPairingInfo(): Promise<PairingInfo> {
  const current = readPairingInfo();
  if (current) return current;

  return rotatePairingInfo();
}

export async function rotatePairingInfo(): Promise<PairingInfo> {
  const next = {
    token: randomBytes(24).toString('base64url'),
    pairingId: '',
    updatedAt: new Date().toISOString(),
  };
  next.pairingId = pairingIdFromToken(next.token);
  const file = pairingFilePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

export function verifyPairingToken(input: string, expected: string): boolean {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readPairingInfo(): PairingInfo | null {
  try {
    const value = JSON.parse(readFileSync(pairingFilePath(), 'utf8')) as Partial<PairingInfo>;
    if (typeof value.token !== 'string' || typeof value.updatedAt !== 'string') return null;
    if (value.token.length === 0) return null;
    return {
      token: value.token,
      pairingId:
        typeof value.pairingId === 'string' && value.pairingId.length > 0
          ? value.pairingId
          : pairingIdFromToken(value.token),
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

function pairingIdFromToken(token: string) {
  return `YMT-${createHash('sha256').update(token).digest('hex').slice(0, 6).toUpperCase()}`;
}
