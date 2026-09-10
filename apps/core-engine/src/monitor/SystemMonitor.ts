import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { Logger } from '../utils/Logger';

const logger = new Logger('SystemMonitor');

const SCREEN_SHARE_APPS = [
  'zoom',
  'teams',
  'webex',
  'slack',
  'discord',
  'loom',
  'obs',
  'obs64',
  'googlemeetpwa',
];

const SCREEN_SHARE_WINDOW_TITLES = [
  'zoom meeting',
  'google meet',
  'microsoft teams',
  'webex',
  'loom',
  'obs studio',
];

export class SystemMonitor extends EventEmitter {
  private pollInterval = 5000; // Check every 5 seconds
  private timer: ReturnType<typeof setInterval> | null = null;
  private wasSharing = false;
  private autoHideEnabled = false;
  private isChecking = false;

  setAutoHide(enabled: boolean) {
    this.autoHideEnabled = enabled;
    logger.info(`🖥️ Auto-Hide configured: ${enabled}`);
    if (!enabled && this.wasSharing) {
      this.wasSharing = false;
      this.emit('screenshare:stop');
    }
  }

  start() {
    logger.info('🖥️ System monitor started');
    this.timer = setInterval(() => this.checkScreenShare(), this.pollInterval);
    // Run immediately
    this.checkScreenShare();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private checkScreenShare() {
    if (!this.autoHideEnabled) {
      if (this.wasSharing) {
        this.wasSharing = false;
        this.emit('screenshare:stop');
      }
      return;
    }

    if (this.isChecking) return;
    this.isChecking = true;

    if (process.platform === 'win32') {
      this.checkWindowsScreenShare();
    } else if (process.platform === 'darwin') {
      this.checkMacScreenShare();
    } else {
      this.checkLinuxScreenShare();
    }
  }

  private checkWindowsScreenShare() {
    // Check running processes for screen share apps
    exec('tasklist /fo csv /nh', (err, stdout) => {
      this.isChecking = false;
      if (err) return;

      const lower = stdout.toLowerCase();
      const isSharing = SCREEN_SHARE_APPS.some((app) =>
        lower.includes(app.toLowerCase())
      );

      this.updateShareState(isSharing);
    });
  }

  private checkMacScreenShare() {
    // On Mac, check for known screen share processes
    exec('ps aux', (err, stdout) => {
      this.isChecking = false;
      if (err) return;

      const lower = stdout.toLowerCase();
      const isSharing = SCREEN_SHARE_APPS.some((app) =>
        lower.includes(app.toLowerCase())
      );

      this.updateShareState(isSharing);
    });
  }

  private checkLinuxScreenShare() {
    exec('ps aux', (err, stdout) => {
      this.isChecking = false;
      if (err) return;

      const lower = stdout.toLowerCase();
      const isSharing = SCREEN_SHARE_APPS.some((app) =>
        lower.includes(app.toLowerCase())
      );

      this.updateShareState(isSharing);
    });
  }

  private updateShareState(isSharing: boolean) {
    if (isSharing && !this.wasSharing) {
      logger.warn('🚨 Screen share DETECTED');
      this.wasSharing = true;
      this.emit('screenshare:start');
    } else if (!isSharing && this.wasSharing) {
      logger.info('✅ Screen share ENDED');
      this.wasSharing = false;
      this.emit('screenshare:stop');
    }
  }

  isSharing() {
    return this.wasSharing;
  }
}
