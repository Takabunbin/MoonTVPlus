export const OIDC_USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidOidcUsername(username: string): boolean {
  return OIDC_USERNAME_PATTERN.test(username);
}
