import { EventEmitter } from 'events';
export declare class SystemMonitor extends EventEmitter {
    private pollInterval;
    private timer;
    private wasSharing;
    private autoHideEnabled;
    private isChecking;
    setAutoHide(enabled: boolean): void;
    start(): void;
    stop(): void;
    private checkScreenShare;
    private checkWindowsScreenShare;
    private checkMacScreenShare;
    private checkLinuxScreenShare;
    private updateShareState;
    isSharing(): boolean;
}
//# sourceMappingURL=SystemMonitor.d.ts.map