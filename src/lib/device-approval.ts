/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { getStorage } from '@/lib/db';

export const MAX_APPROVED_DEVICES = 3;

const APPROVED_HASH = 'device_control:approved';
const PENDING_HASH = 'device_control:pending';
const INITIALIZED_HASH = 'device_control:initialized';

export interface ManagedDevice {
  username: string;
  deviceId: string;
  deviceInfo: string;
  createdAt: number;
  lastSeen: number;
  approvedAt?: number;
}

function field(username: string, deviceId: string): string {
  return `${username}:${deviceId}`;
}

async function getAdapter(): Promise<any> {
  const storage = getStorage();
  const adapter = (storage as any)?.adapter;

  if (
    !adapter ||
    typeof adapter.hGet !== 'function' ||
    typeof adapter.hSet !== 'function' ||
    typeof adapter.hDel !== 'function' ||
    typeof adapter.hGetAll !== 'function'
  ) {
    throw new Error('当前存储后端不支持设备审批所需的 Redis Hash 操作');
  }

  return adapter;
}

async function deleteRecord(
  hash: string,
  username: string,
  deviceId: string
): Promise<void> {
  const adapter = await getAdapter();
  await adapter.hDel(hash, field(username, deviceId));
}

const CHECK_OR_REGISTER_DEVICE_SCRIPT = `
local field = ARGV[1]
local username = ARGV[2]
local deviceId = ARGV[3]
local deviceInfo = ARGV[4]
local now = tonumber(ARGV[5])
local prefix = username .. ':'

local function approvedCount()
  local approved = redis.call('HGETALL', KEYS[1])
  local count = 0
  for index = 1, #approved, 2 do
    if string.sub(approved[index], 1, string.len(prefix)) == prefix then
      count = count + 1
    end
  end
  return count
end

local approved = redis.call('HGET', KEYS[1], field)
if approved then
  local ok, record = pcall(cjson.decode, approved)
  if not ok then return {4, 0, 0} end
  record.deviceInfo = deviceInfo
  record.lastSeen = now
  redis.call('HSET', KEYS[1], field, cjson.encode(record))
  return {1, approvedCount(), 0}
end

local count = approvedCount()
if count == 0 and not redis.call('HGET', KEYS[3], username) then
  local record = {
    username = username,
    deviceId = deviceId,
    deviceInfo = deviceInfo,
    createdAt = now,
    lastSeen = now,
    approvedAt = now
  }
  redis.call('HSET', KEYS[1], field, cjson.encode(record))
  redis.call('HSET', KEYS[3], username, tostring(now))
  redis.call('HDEL', KEYS[2], field)
  return {1, 1, 1}
end

local createdAt = now
local pending = redis.call('HGET', KEYS[2], field)
if pending then
  local ok, record = pcall(cjson.decode, pending)
  if ok and record.createdAt then createdAt = record.createdAt end
end
redis.call('HSET', KEYS[2], field, cjson.encode({
  username = username,
  deviceId = deviceId,
  deviceInfo = deviceInfo,
  createdAt = createdAt,
  lastSeen = now
}))
return {2, count, 0}
`;

const APPROVE_PENDING_DEVICE_SCRIPT = `
local pending = redis.call('HGET', KEYS[2], ARGV[1])
if not pending then return 0 end

local prefix = ARGV[2] .. ':'
local approved = redis.call('HGETALL', KEYS[1])
local count = 0
for index = 1, #approved, 2 do
  if string.sub(approved[index], 1, string.len(prefix)) == prefix then
    count = count + 1
  end
end
if count >= tonumber(ARGV[3]) then return 2 end

local ok, record = pcall(cjson.decode, pending)
if not ok then return 3 end
record.approvedAt = tonumber(ARGV[4])
record.lastSeen = tonumber(ARGV[4])
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(record))
redis.call('HDEL', KEYS[2], ARGV[1])
return 1
`;

async function listRecords(
  hash: string,
  username?: string
): Promise<ManagedDevice[]> {
  const adapter = await getAdapter();
  const raw = await adapter.hGetAll(hash);

  if (!raw || typeof raw !== 'object') return [];

  const result: ManagedDevice[] = [];

  for (const value of Object.values(raw)) {
    try {
      const record = JSON.parse(value as string) as ManagedDevice;
      if (!username || record.username === username) {
        result.push(record);
      }
    } catch {
      // 忽略损坏记录
    }
  }

  return result.sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function getApprovedDevices(
  username?: string
): Promise<ManagedDevice[]> {
  return listRecords(APPROVED_HASH, username);
}

export async function getPendingDevices(
  username?: string
): Promise<ManagedDevice[]> {
  return listRecords(PENDING_HASH, username);
}

export async function checkOrRegisterDevice(
  username: string,
  deviceId: string,
  deviceInfo: string
): Promise<{
  status: 'approved' | 'pending';
  approvedCount: number;
  limitReached: boolean;
  firstDevice: boolean;
}> {
  const adapter = await getAdapter();
  if (typeof adapter.eval !== 'function') {
    throw new Error('当前存储后端不支持原子设备审批脚本');
  }

  const result = await adapter.eval(
    CHECK_OR_REGISTER_DEVICE_SCRIPT,
    [APPROVED_HASH, PENDING_HASH, INITIALIZED_HASH],
    [field(username, deviceId), username, deviceId, deviceInfo, String(Date.now())]
  );
  const [statusCode, approvedCount, firstDevice] = result as number[];

  if (statusCode === 4) throw new Error('已批准设备记录损坏');
  if (statusCode !== 1 && statusCode !== 2) {
    throw new Error('原子设备登记脚本返回了未知结果');
  }

  return {
    status: statusCode === 1 ? 'approved' : 'pending',
    approvedCount,
    limitReached: approvedCount >= MAX_APPROVED_DEVICES,
    firstDevice: firstDevice === 1,
  };
}
export async function approvePendingDevice(
  username: string,
  deviceId: string
): Promise<void> {
  const adapter = await getAdapter();
  if (typeof adapter.eval !== 'function') {
    throw new Error('当前存储后端不支持原子设备审批脚本');
  }

  const result = await adapter.eval(
    APPROVE_PENDING_DEVICE_SCRIPT,
    [APPROVED_HASH, PENDING_HASH],
    [
      field(username, deviceId),
      username,
      String(MAX_APPROVED_DEVICES),
      String(Date.now()),
    ]
  );

  switch (Number(result)) {
    case 1:
      return;
    case 0:
      throw new Error('待审批设备不存在');
    case 2:
      throw new Error(`该用户已达到 ${MAX_APPROVED_DEVICES} 台设备上限`);
    case 3:
      throw new Error('待审批设备记录损坏');
    default:
      throw new Error('原子设备审批脚本返回了未知结果');
  }
}
export async function rejectPendingDevice(
  username: string,
  deviceId: string
): Promise<void> {
  await deleteRecord(PENDING_HASH, username, deviceId);
}

export async function revokeApprovedDevice(
  username: string,
  deviceId: string
): Promise<void> {
  await deleteRecord(APPROVED_HASH, username, deviceId);
}
