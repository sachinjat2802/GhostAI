"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemMonitor = void 0;
const events_1 = require("events");
const child_process_1 = require("child_process");
const Logger_1 = require("../utils/Logger");
const logger = new Logger_1.Logger('SystemMonitor');
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
class SystemMonitor extends events_1.EventEmitter {
    pollInterval = 5000; // Check every 5 seconds
    timer = null;
    wasSharing = false;
    autoHideEnabled = false;
    isChecking = false;
    setAutoHide(enabled) {
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
    checkScreenShare() {
        if (!this.autoHideEnabled) {
            if (this.wasSharing) {
                this.wasSharing = false;
                this.emit('screenshare:stop');
            }
            return;
        }
        if (this.isChecking)
            return;
        this.isChecking = true;
        if (process.platform === 'win32') {
            this.checkWindowsScreenShare();
        }
        else if (process.platform === 'darwin') {
            this.checkMacScreenShare();
        }
        else {
            this.checkLinuxScreenShare();
        }
    }
    checkWindowsScreenShare() {
        // Check running processes for screen share apps
        (0, child_process_1.exec)('tasklist /fo csv /nh', (err, stdout) => {
            this.isChecking = false;
            if (err)
                return;
            const lower = stdout.toLowerCase();
            const isSharing = SCREEN_SHARE_APPS.some((app) => lower.includes(app.toLowerCase()));
            this.updateShareState(isSharing);
        });
    }
    checkMacScreenShare() {
        // On Mac, check for known screen share processes
        (0, child_process_1.exec)('ps aux', (err, stdout) => {
            this.isChecking = false;
            if (err)
                return;
            const lower = stdout.toLowerCase();
            const isSharing = SCREEN_SHARE_APPS.some((app) => lower.includes(app.toLowerCase()));
            this.updateShareState(isSharing);
        });
    }
    checkLinuxScreenShare() {
        (0, child_process_1.exec)('ps aux', (err, stdout) => {
            this.isChecking = false;
            if (err)
                return;
            const lower = stdout.toLowerCase();
            const isSharing = SCREEN_SHARE_APPS.some((app) => lower.includes(app.toLowerCase()));
            this.updateShareState(isSharing);
        });
    }
    updateShareState(isSharing) {
        if (isSharing && !this.wasSharing) {
            logger.warn('🚨 Screen share DETECTED');
            this.wasSharing = true;
            this.emit('screenshare:start');
        }
        else if (!isSharing && this.wasSharing) {
            logger.info('✅ Screen share ENDED');
            this.wasSharing = false;
            this.emit('screenshare:stop');
        }
    }
    isSharing() {
        return this.wasSharing;
    }
}
exports.SystemMonitor = SystemMonitor;
//# sourceMappingURL=SystemMonitor.js.map