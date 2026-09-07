/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { invalidateDeviceAccessToken } from '@/lib/access-token-invalidation';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db, getStorage } from '@/lib/db';
import {
  approvePendingDevice,
  getApprovedDevices,
  getPendingDevices,
  MAX_APPROVED_DEVICES,
  rejectPendingDevice,
  revokeApprovedDevice,
} from '@/lib/device-approval';
import { revokeRefreshTokensByDeviceId } from '@/lib/refresh-token';

export const runtime = 'nodejs';

type Role = 'owner' | 'admin' | 'user';

async function getUserRole(username: string): Promise<Role | null> {
  if (username === process.env.USERNAME) return 'owner';
  const userInfo = await db.getUserInfoV2(username);
  if (userInfo) return userInfo.banned ? 'user' : userInfo.role;

  const config = await getConfig();
  const user = config.UserConfig.Users.find((item) => item.username === username);
  if (!user) return null;
  return user.banned ? 'user' : user.role;
}

async function authorize(request: NextRequest, targetUsername?: string) {
  const auth = getAuthInfoFromCookie(request);
  if (!auth?.username) throw new Error('Unauthorized');

  const operatorRole = await getUserRole(auth.username);
  if (operatorRole !== 'owner' && operatorRole !== 'admin') {
    throw new Error('权限不足');
  }

  if (targetUsername) {
    const targetRole = await getUserRole(targetUsername);
    if (!targetRole) throw new Error('目标用户不存在');
    if (
      operatorRole === 'admin' &&
      targetUsername !== auth.username &&
      targetRole !== 'user'
    ) {
      throw new Error('权限不足');
    }
  }

  return { operatorRole, username: auth.username };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '操作失败';
  const status = message === 'Unauthorized' ? 401 : message === '权限不足' ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const { operatorRole, username } = await authorize(request);
    const [approved, pending] = await Promise.all([
      getApprovedDevices(),
      getPendingDevices(),
    ]);
    const allowedUsernames = new Set<string>([username]);
    if (operatorRole === 'owner') {
      for (const device of [...approved, ...pending]) allowedUsernames.add(device.username);
    } else {
      const usernames = [...new Set([...approved, ...pending].map((device) => device.username))];
      const roles = await Promise.all(usernames.map(async (target) => ({
        target,
        role: await getUserRole(target),
      })));
      for (const target of roles) {
        if (target.role === 'user') allowedUsernames.add(target.target);
      }
    }
    const visible = (device: { username: string }) => allowedUsernames.has(device.username);
    const visibleApproved = approved.filter(visible);
    const approvedCounts = new Map<string, number>();
    for (const device of visibleApproved) {
      approvedCounts.set(device.username, (approvedCounts.get(device.username) || 0) + 1);
    }

    return NextResponse.json(
      {
        approvedDevices: visibleApproved,
        pendingDevices: pending.filter(visible).map((device) => ({
          ...device,
          approvedCount: approvedCounts.get(device.username) || 0,
          limitReached: (approvedCounts.get(device.username) || 0) >= MAX_APPROVED_DEVICES,
        })),
        maxApprovedDevices: MAX_APPROVED_DEVICES,
        maxConcurrentPlayback: 1,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, username, deviceId } = (await request.json()) as {
      action?: 'approve' | 'reject' | 'revoke';
      username?: string;
      deviceId?: string;
    };
    if (!action || !username?.trim() || !deviceId?.trim()) {
      throw new Error('缺少操作、用户名或设备 ID');
    }
    await authorize(request, username);

    if (action === 'approve') {
      await approvePendingDevice(username, deviceId);
    } else if (action === 'reject') {
      await rejectPendingDevice(username, deviceId);
    } else if (action === 'revoke') {
      const tokenIds = await revokeRefreshTokensByDeviceId(username, deviceId);
      const storage = getStorage();
      for (const tokenId of tokenIds) {
        invalidateDeviceAccessToken(username, tokenId);
        await storage.deletePushSubscriptionsByTokenId?.(username, tokenId);
      }
      await revokeApprovedDevice(username, deviceId);
    } else {
      throw new Error('不支持的操作');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('设备控制操作失败:', error);
    return errorResponse(error);
  }
}
