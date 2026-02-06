import { SessionInfo } from '../types.js';

export function formatSessionOutput(sessionName: string, line: string): string {
  return `[${sessionName}] ${line}`;
}

export function formatStatusLine(info: SessionInfo): string {
  return `${info.name} [${info.state}] ${info.workingDirectory} (pid: ${info.pid})`;
}
