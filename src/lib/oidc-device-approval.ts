import { NextRequest } from 'next/server';

import { checkOrRegisterDevice } from './device-approval';
import { getOrCreateDeviceId } from './device-id';

export async function checkOidcDeviceApproval(
  request: NextRequest,
  username: string,
  deviceInfo: string
) {
  const { deviceId } = getOrCreateDeviceId(request);
  const result = await checkOrRegisterDevice(username, deviceId, deviceInfo);

  return { deviceId, ...result };
}
