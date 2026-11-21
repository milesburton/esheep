import { app } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Start at login.
 * - Windows: Electron writes HKCU\Software\Microsoft\Windows\CurrentVersion\Run for us.
 * - macOS:   Electron registers a login item (no AppleScript needed).
 * - Linux:   write (or remove) ~/.config/autostart/esheep.desktop.
 * Not available in dev, so we never register the bare electron binary.
 */
export const autoLaunchAvailable = (): boolean => app.isPackaged;

const linuxFile = (): string => path.join(os.homedir(), '.config', 'autostart', 'esheep.desktop');

export const isAutoLaunchEnabled = (): boolean =>
  process.platform === 'linux'
    ? fs.existsSync(linuxFile())
    : app.getLoginItemSettings().openAtLogin;

export const setAutoLaunch = (on: boolean): void => {
  if (!autoLaunchAvailable()) return;
  if (process.platform === 'linux') {
    if (!on) {
      fs.rmSync(linuxFile(), { force: true });
      return;
    }
    fs.mkdirSync(path.dirname(linuxFile()), { recursive: true });
    const exec = process.env.APPIMAGE ?? process.execPath;
    fs.writeFileSync(
      linuxFile(),
      `[Desktop Entry]\nType=Application\nName=eSheep\nExec="${exec}"\nX-GNOME-Autostart-enabled=true\n`,
    );
    return;
  }
  app.setLoginItemSettings({ openAtLogin: on });
};
