import { app } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Start at login.
 * - Windows: Electron writes HKCU\Software\Microsoft\Windows\CurrentVersion\Run for us.
 * - macOS:   Electron registers a login item (no AppleScript needed).
 * - Linux:   write ~/.config/autostart/esheep.desktop.
 * Skipped in dev so we don't register the bare electron binary.
 */
export const enableAutoLaunch = (): void => {
  if (!app.isPackaged) return;

  if (process.platform === 'linux') {
    const dir = path.join(os.homedir(), '.config', 'autostart');
    fs.mkdirSync(dir, { recursive: true });
    const exec = process.env.APPIMAGE ?? process.execPath;
    fs.writeFileSync(
      path.join(dir, 'esheep.desktop'),
      `[Desktop Entry]\nType=Application\nName=eSheep\nExec="${exec}"\nX-GNOME-Autostart-enabled=true\n`,
    );
    return;
  }
  app.setLoginItemSettings({ openAtLogin: true });
};
