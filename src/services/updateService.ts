import axios from 'axios';
import { check } from '@tauri-apps/plugin-updater';
import { isTauriRuntime } from './windowMode';

const APP_VERSION = String(import.meta.env.VITE_APP_VERSION ?? '1.0.0').trim();
const UPDATE_CHECK_URL = String(import.meta.env.VITE_UPDATE_CHECK_URL ?? '').trim();

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion?: string;
  available: boolean;
  body?: string;
  source: 'tauri' | 'api' | 'demo';
}

function isNewerVersion(latest: string, current: string) {
  const latestParts = latest.replace(/^v/i, '').split('.').map(Number);
  const currentParts = current.replace(/^v/i, '').split('.').map(Number);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const latestPart = latestParts[index] || 0;
    const currentPart = currentParts[index] || 0;
    if (latestPart !== currentPart) return latestPart > currentPart;
  }
  return false;
}

export async function checkForApplicationUpdate(): Promise<UpdateCheckResult> {
  if (UPDATE_CHECK_URL) {
    const response = await axios.get(UPDATE_CHECK_URL);
    const payload = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : {};
    const data = payload.data && typeof payload.data === 'object'
      ? payload.data as Record<string, unknown>
      : payload;
    const latestVersion = String(data.version ?? data.latestVersion ?? '').trim();

    return {
      currentVersion: APP_VERSION,
      latestVersion: latestVersion || undefined,
      available: Boolean(latestVersion && isNewerVersion(latestVersion, APP_VERSION)),
      body: String(data.body ?? data.releaseNotes ?? '').trim() || undefined,
      source: 'api',
    };
  }

  if (isTauriRuntime()) {
    const update = await check();
    if (!update) {
      return { currentVersion: APP_VERSION, available: false, source: 'tauri' };
    }

    const result: UpdateCheckResult = {
      currentVersion: update.currentVersion,
      latestVersion: update.version,
      available: true,
      body: update.body,
      source: 'tauri',
    };
    await update.close();
    return result;
  }

  return {
    currentVersion: APP_VERSION,
    available: false,
    source: 'demo',
  };
}
