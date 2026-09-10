const proc = require('child_process');
const path = require('path');
const fs = require('fs');

// Check for headless mode argument
if (process.argv.includes('--headless')) {
    console.log('👻 Ghost AI: Running in 100% Undetectable Headless Mode (Remote Screen Mirror only)');
    console.log('📡 Access settings and live feed at: http://localhost:3001/spy');
    // Keep process alive so concurrently doesn't shut down
    setInterval(() => {}, 1000 * 60 * 60);
    return;
}

let electronPath;
try {
    electronPath = require('electron');
} catch (e) {
    electronPath = path.resolve(__dirname, '../../node_modules/.pnpm/electron@41.0.3/node_modules/electron/dist/electron.exe');
}

if (!electronPath || !fs.existsSync(electronPath)) {
    console.error('Electron binary not found at:', electronPath);
    process.exit(1);
}

// Implement Process Spoofing
const electronDir = path.dirname(electronPath);
const spoofedPath = path.join(electronDir, 'msedge_security_broker.exe');
let activeExecutable = electronPath;

try {
    fs.copyFileSync(electronPath, spoofedPath);
    activeExecutable = spoofedPath;
    console.log(`🛡️ Process name spoofed as: msedge_security_broker.exe`);
} catch (e) {
    console.warn('⚠️ Could not copy binary for spoofing, running under original name:', e.message);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = proc.spawn(activeExecutable, ['.'], {
    stdio: 'inherit',
    windowsHide: false,
    cwd: __dirname,
    env: env
});

function cleanup() {
    if (activeExecutable === spoofedPath && fs.existsSync(spoofedPath)) {
        try {
            fs.unlinkSync(spoofedPath);
        } catch (e) {}
    }
}

child.on('close', (code) => {
    cleanup();
    process.exit(code);
});

process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
});

process.on('exit', () => {
    cleanup();
});
