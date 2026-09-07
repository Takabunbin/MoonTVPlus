import { NextRequest, NextResponse } from 'next/server';

export const DEVICE_COOKIE_NAME = 'moontv_device_id';
export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function isValidDeviceId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function getOrCreateDeviceId(request: NextRequest): {
  deviceId: string;
  isNew: boolean;
} {
  const existing = request.cookies.get(DEVICE_COOKIE_NAME)?.value?.trim();

  if (existing && isValidDeviceId(existing)) {
    return { deviceId: existing, isNew: false };
  }

  return {
    deviceId: crypto.randomUUID(),
    isNew: true,
  };
}

export function setDeviceIdCookie(
  response: NextResponse,
  deviceId: string
): void {
  response.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: true,
  });
}
