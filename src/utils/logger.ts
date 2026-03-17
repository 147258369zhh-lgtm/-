/**
 * OpenClaw Frontend Logger
 * 
 * Sends frontend logs to the same backend log file via Tauri IPC.
 * Falls back to console.log when not in Tauri environment.
 */
import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const IS_TAURI = !!(window as any).__TAURI_INTERNALS__;

/** Send a log message to the backend log file */
async function sendLog(level: LogLevel, module: string, message: string) {
  // Always log to console
  const prefix = `[${level}] [FE:${module}]`;
  if (level === 'ERROR') {
    console.error(prefix, message);
  } else if (level === 'WARN') {
    console.warn(prefix, message);
  } else {
    console.log(prefix, message);
  }

  // Also send to backend log file if in Tauri
  if (IS_TAURI) {
    try {
      await invoke('frontend_log', { level, module, message });
    } catch {
      // Silently fail if backend is not ready
    }
  }
}

/** Frontend logger - logs to both console AND backend log file */
export const logger = {
  info: (module: string, message: string) => sendLog('INFO', module, message),
  warn: (module: string, message: string) => sendLog('WARN', module, message),
  error: (module: string, message: string) => sendLog('ERROR', module, message),
  
  /** Log with string formatting */
  log: (module: string, ...args: any[]) => {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    sendLog('INFO', module, message);
  },
};

/** Get the backend log file path */
export async function getLogPath(): Promise<string> {
  if (!IS_TAURI) return '(not in Tauri)';
  try {
    return await invoke('get_log_path') as string;
  } catch {
    return '(unknown)';
  }
}

export default logger;
