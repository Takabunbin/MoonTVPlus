import { db } from './db';
import { isValidOidcUsername } from './oidc-registration';

type OidcUserInfo = Record<string, unknown>;

type OidcRegistrationConfig = {
  DefaultUserTags?: string[];
  OIDCMinTrustLevel?: number;
};

function stringClaim(userInfo: OidcUserInfo, claim: string): string | undefined {
  const value = userInfo[claim];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function stableHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function withSuffix(username: string, suffix: string): string {
  return `${username.slice(0, 20 - suffix.length - 1)}_${suffix}`;
}

export async function autoRegisterOidcUser(
  userInfo: OidcUserInfo,
  config: OidcRegistrationConfig
): Promise<string | null> {
  const sub = stringClaim(userInfo, 'sub');
  if (!sub) return null;

  const existingUsername = await db.getUserByOidcSub(sub);
  if (existingUsername) return existingUsername;

  const minTrustLevel = config.OIDCMinTrustLevel || 0;
  const trustLevel = typeof userInfo.trust_level === 'number' ? userInfo.trust_level : 0;
  if (minTrustLevel > 0 && trustLevel < minTrustLevel) return null;

  const hash = await stableHash(sub);
  const email = stringClaim(userInfo, 'email');
  const candidates = [
    stringClaim(userInfo, 'preferred_username'),
    stringClaim(userInfo, 'username'),
    stringClaim(userInfo, 'user_name'),
    stringClaim(userInfo, 'nickname'),
    stringClaim(userInfo, 'login'),
    stringClaim(userInfo, 'name'),
    email?.split('@')[0],
    `oidc_${hash.slice(0, 12)}`,
  ];
  const checked = new Set<string>();
  let username: string | null = null;

  for (const candidate of candidates) {
    if (!candidate || !isValidOidcUsername(candidate) || checked.has(candidate)) continue;
    checked.add(candidate);

    if (candidate !== process.env.USERNAME && !(await db.checkUserExistV2(candidate))) {
      username = candidate;
      break;
    }

    const suffixed = withSuffix(candidate, hash.slice(0, 4));
    if (
      !checked.has(suffixed) &&
      suffixed !== process.env.USERNAME &&
      !(await db.checkUserExistV2(suffixed))
    ) {
      username = suffixed;
      break;
    }
    checked.add(suffixed);
  }

  if (!username) return null;

  const defaultTags = config.DefaultUserTags?.length ? config.DefaultUserTags : undefined;
  await db.createUserV2(username, crypto.randomUUID(), 'user', defaultTags, sub);
  return username;
}
