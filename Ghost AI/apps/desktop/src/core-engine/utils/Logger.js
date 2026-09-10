"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const COLORS = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';
class Logger {
    name;
    constructor(name) {
        this.name = name;
    }
    log(level, message, data) {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const color = COLORS[level];
        const prefix = `${color}[${time}] [${level.toUpperCase().padEnd(5)}] [${this.name}]${RESET}`;
        if (data !== undefined) {
            console.log(`${prefix} ${message}`, data);
        }
        else {
            console.log(`${prefix} ${message}`);
        }
    }
    debug(msg, data) {
        if (process.env.LOG_LEVEL === 'debug')
            this.log('debug', msg, data);
    }
    info(msg, data) { this.log('info', msg, data); }
    warn(msg, data) { this.log('warn', msg, data); }
    error(msg, data) { this.log('error', msg, data); }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map