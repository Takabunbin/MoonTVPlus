'use client';

import { useCallback, useEffect, useState } from 'react';

type Device = {
  username: string;
  deviceId: string;
  deviceInfo: string;
  createdAt: number;
  lastSeen: number;
  approvedAt?: number;
  approvedCount?: number;
  limitReached?: boolean;
};

type DeviceControlData = {
  approvedDevices: Device[];
  pendingDevices: Device[];
  maxApprovedDevices: number;
  maxConcurrentPlayback: number;
};

function formatTime(timestamp?: number) {
  return timestamp ? new Date(timestamp).toLocaleString('zh-CN') : '-';
}

function shortDeviceId(deviceId: string) {
  return deviceId.length > 16
    ? `${deviceId.slice(0, 8)}…${deviceId.slice(-6)}`
    : deviceId;
}

export default function DeviceControlPanel() {
  const [data, setData] = useState<DeviceControlData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/device-control', {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '加载设备列表失败');
      setData(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '加载设备列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const perform = async (action: 'approve' | 'reject' | 'revoke', device: Device) => {
    const key = `${action}:${device.username}:${device.deviceId}`;
    setActing(key);
    setError('');
    try {
      const response = await fetch('/api/admin/device-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, username: device.username, deviceId: device.deviceId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '操作失败');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '操作失败');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className='text-sm text-gray-500 dark:text-gray-400'>加载设备控制数据…</div>;
  }

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <div className='rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40'>
          <div className='text-sm text-gray-500 dark:text-gray-400'>每用户最大已批准设备</div>
          <div className='mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100'>{data?.maxApprovedDevices ?? 3}</div>
        </div>
        <div className='rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40'>
          <div className='text-sm text-gray-500 dark:text-gray-400'>每用户最大同时播放</div>
          <div className='mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100'>{data?.maxConcurrentPlayback ?? 1}</div>
          <div className='mt-1 text-xs text-gray-500 dark:text-gray-400'>当前仅预留策略，尚未启用播放锁。</div>
        </div>
      </div>

      {error && <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'>{error}</div>}

      <section>
        <div className='mb-3 flex items-center justify-between'>
          <h4 className='text-base font-medium text-gray-900 dark:text-gray-100'>待审批设备</h4>
          <button onClick={load} className='px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'>刷新</button>
        </div>
        <DeviceTable emptyText='暂无待审批设备' devices={data?.pendingDevices || []} pending acting={acting} onAction={perform} />
      </section>

      <section>
        <h4 className='mb-3 text-base font-medium text-gray-900 dark:text-gray-100'>已批准设备</h4>
        <DeviceTable emptyText='暂无已批准设备' devices={data?.approvedDevices || []} acting={acting} onAction={perform} />
      </section>
    </div>
  );
}

function DeviceTable({
  devices,
  pending = false,
  emptyText,
  acting,
  onAction,
}: {
  devices: Device[];
  pending?: boolean;
  emptyText: string;
  acting: string | null;
  onAction: (action: 'approve' | 'reject' | 'revoke', device: Device) => void;
}) {
  if (!devices.length) return <div className='rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400'>{emptyText}</div>;

  return (
    <div className='overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700'>
      <table className='min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700'>
        <thead className='bg-gray-50 dark:bg-gray-800/60'>
          <tr className='text-left text-xs text-gray-500 dark:text-gray-400'>
            <th className='px-4 py-3 font-medium'>用户</th><th className='px-4 py-3 font-medium'>设备</th><th className='px-4 py-3 font-medium'>设备 ID</th>
            <th className='px-4 py-3 font-medium'>{pending ? '首次申请' : '批准时间'}</th><th className='px-4 py-3 font-medium'>最后活动</th><th className='px-4 py-3 font-medium text-right'>操作</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800/30'>
          {devices.map((device) => {
            const atLimit = pending && device.limitReached;
            const approveKey = `approve:${device.username}:${device.deviceId}`;
            return <tr key={`${device.username}:${device.deviceId}`} className='text-gray-700 dark:text-gray-300'>
              <td className='whitespace-nowrap px-4 py-3 font-medium'>{device.username}</td><td className='whitespace-nowrap px-4 py-3'>{device.deviceInfo}</td>
              <td className='px-4 py-3 font-mono text-xs' title={device.deviceId}>{shortDeviceId(device.deviceId)}</td><td className='whitespace-nowrap px-4 py-3'>{formatTime(pending ? device.createdAt : device.approvedAt)}</td><td className='whitespace-nowrap px-4 py-3'>{formatTime(device.lastSeen)}</td>
              <td className='whitespace-nowrap px-4 py-3 text-right'>{pending ? <div className='flex flex-col items-end gap-1 sm:flex-row sm:justify-end'><button disabled={atLimit || acting === approveKey} title={atLimit ? `已达到 ${device.approvedCount || 3} 台上限` : undefined} onClick={() => onAction('approve', device)} className={atLimit || acting === approveKey ? 'cursor-not-allowed rounded-full bg-gray-300 px-3 py-1.5 text-xs font-medium text-white dark:bg-gray-600' : 'rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-200'}>{atLimit ? `已达到 ${device.approvedCount || 3} 台上限` : acting === approveKey ? '批准中…' : '批准'}</button><button disabled={acting === `reject:${device.username}:${device.deviceId}`} onClick={() => onAction('reject', device)} className='rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200'>拒绝</button></div> : <button disabled={acting === `revoke:${device.username}:${device.deviceId}`} onClick={() => onAction('revoke', device)} className='rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200'>{acting === `revoke:${device.username}:${device.deviceId}` ? '撤销中…' : '撤销'}</button>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
