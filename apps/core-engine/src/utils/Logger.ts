type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

export class Logger {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  private log(level: LogLevel, message: string, data?: any) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const color = COLORS[level];
    const prefix = `${color}[${time}] [${level.toUpperCase().padEnd(5)}] [${this.name}]${RESET}`;

    if (data !== undefined) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  debug(msg: string, data?: any) {
    if (process.env.LOG_LEVEL === 'debug') this.log('debug', msg, data);
  }
  info(msg: string, data?: any)  { this.log('info', msg, data); }
  warn(msg: string, data?: any)  { this.log('warn', msg, data); }
  error(msg: string, data?: any) { this.log('error', msg, data); }
}
