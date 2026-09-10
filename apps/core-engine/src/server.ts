import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventBus } from './utils/EventBus';
import { Logger } from './utils/Logger';
import { ContextService } from './context/ContextService';

const logger = new Logger('EngineServer');

function getLocalIps(): string[] {
  const interfaces = os.networkInterfaces();
  const priorityIps: string[] = [];
  const fallbackIps: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const isVirtual = /virtual|vbox|vmware|wsl|hyper-v|vethernet|bluetooth/i.test(name);
    const isWifiOrEth = /wi-fi|wifi|ethernet|eth|wlan|lan/i.test(name);

    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (isWifiOrEth && !isVirtual) {
          priorityIps.push(net.address);
        } else if (!isVirtual) {
          priorityIps.push(net.address);
        } else {
          fallbackIps.push(net.address);
        }
      }
    }
  }

  const result = [...priorityIps, ...fallbackIps];
  return result.length > 0 ? Array.from(new Set(result)) : ['127.0.0.1'];
}

function getLocalIp(): string {
  return getLocalIps()[0];
}

export class EngineServer {
  private app = express();
  private httpServer = createServer(this.app);
  private io: SocketIOServer;
  private eventBus: EventBus;
  private contextService?: ContextService;

  constructor(eventBus: EventBus, contextService?: ContextService) {
    this.eventBus = eventBus;
    this.contextService = contextService;
    this.io = new SocketIOServer(this.httpServer, {
      cors: { origin: '*' },
      perMessageDeflate: false, // Disables CPU compression on real-time sub-millisecond audio packets
    });
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupRoutes() {
    this.app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (_req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
    this.app.use(express.json());

    // Serve static assets for Mobile Spy Mode cleanly & dynamically
    const possiblePaths = [
      path.join(__dirname, '../public/spy'),
      path.join(__dirname, 'public/spy'),
      path.join(process.cwd(), 'apps/core-engine/public/spy'),
      path.join(process.cwd(), 'public/spy')
    ];
    const publicSpyPath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];

    this.app.use('/spy', express.static(publicSpyPath));

    this.app.get('/spy', (_req, res) => {
      const indexPath = path.join(publicSpyPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Spy UI not found');
      }
    });

    // HTTP Activity Stream (SSE for fetch / EventSource clients)
    this.app.get('/api/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      if (this.contextService) {
        const initialState = {
          type: 'init-state',
          payload: {
            mode: this.contextService.getMode(),
            transcript: this.contextService.getContext(),
            history: (this.contextService as any).historyRing?.toArray() || []
          }
        };
        res.write('data: ' + JSON.stringify(initialState) + '\n\n');
      }

      const sendEvent = (type: string, payload: any) => {
        res.write('data: ' + JSON.stringify({ type, payload }) + '\n\n');
      };

      const listeners: { [event: string]: (data: any) => void } = {
        'ui:transcript': (data) => sendEvent('ui:transcript', data),
        'ui:suggestion': (data) => sendEvent('ui:suggestion', data),
        'ui:suggestion-chunk': (data) => sendEvent('ui:suggestion-chunk', data),
        'ui:suggestion-end': (data) => sendEvent('ui:suggestion-end', data),
        'overlay:hide': (data) => sendEvent('overlay:hide', data),
        'overlay:show': (data) => sendEvent('overlay:show', data),
        'context:cleared': (data) => sendEvent('context:cleared', data),
        'mode-changed': (data) => sendEvent('mode-changed', data),
        'command': (data) => sendEvent('command', data),
      };

      for (const [event, handler] of Object.entries(listeners)) {
        this.eventBus.on(event, handler);
      }

      req.on('close', () => {
        for (const [event, handler] of Object.entries(listeners)) {
          this.eventBus.removeListener(event, handler);
        }
        res.end();
      });
    });

    // Health check & Server Info
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', service: 'ghost-ai-core', timestamp: Date.now() });
    });

    this.app.get('/api/info', (_req, res) => {
      const port = process.env.ENGINE_PORT || '3001';
      const ip = getLocalIp();
      const spyUrl = `http://${ip}:${port}/spy`;
      const localSpyUrl = `http://localhost:${port}/spy`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(spyUrl)}`;

      res.json({
        status: 'ok',
        ip,
        port,
        spyUrl,
        localSpyUrl,
        qrUrl,
      });
    });

    // Session Export Routes
    this.app.get('/export/md', (_req, res) => {
      this.eventBus.emit('command:export-md', res);
    });

    this.app.get('/export/json', (_req, res) => {
      this.eventBus.emit('command:export-json', res);
    });

    // REST settings endpoint
    this.app.post('/api/settings', (req, res) => {
      const settings = req.body;
      logger.info(`⚙️ Settings sync via HTTP: API Key: ${settings.apiKey ? 'Set' : 'Empty'}`);
      this.eventBus.emit('settings:sync', settings);
      this.broadcast('settings-sync', settings);
      res.json({ ok: true });
    });

    // REST binary audio chunk endpoint for mobile microphone streaming
    this.app.post('/api/audio-chunk', express.raw({ type: 'application/octet-stream', limit: '10mb' }), (req, res) => {
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        this.eventBus.emit('audio:chunk', req.body);
      }
      res.json({ ok: true });
    });

    // REST fallback for commands
    this.app.post('/command', (req, res) => {
      const { type, payload } = req.body;
      this.eventBus.emit(`command:${type}`, payload);
      this.eventBus.emit('command', { type, payload });
      this.broadcast('command', { type, payload });
      res.json({ ok: true });
    });
  }

  private setupSocketHandlers() {
    // 1. Forward events from EventBus → ALL connected clients
    const forwardToAll = [
      'ui:transcript',
      'ui:suggestion',
      'ui:suggestion-chunk',
      'ui:suggestion-end',
      'overlay:hide',
      'overlay:show',
      'context:cleared',
      'mode-changed',
    ];

    forwardToAll.forEach((event) => {
      this.eventBus.on(event, (data: any) => {
        this.broadcast(event, data);
      });
    });

    // 2. Handle connections
    this.io.on('connection', (socket) => {
      logger.info(`🔗 Client connected: ${socket.id}`);

      if (this.contextService) {
        socket.emit('init-state', {
          mode: this.contextService.getMode(),
          transcript: this.contextService.getContext(),
          history: (this.contextService as any).historyRing?.toArray() || []
        });
      }

      // Forward commands from client → Engine
      socket.on('command', ({ type, payload }: { type: string; payload: any }) => {
        logger.debug(`→ Command from ${socket.id}: ${type}`, payload);
        this.eventBus.emit(`command:${type}`, payload);
        this.eventBus.emit('command', { type, payload });
        // Sync OTHER clients (e.g. phone → desktop sync)
        this.broadcast('command', { type, payload });
      });

      // Receive raw PCM audio chunks from client
      socket.on('audio-chunk', (data: any) => {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.eventBus.emit('audio:chunk', buffer);
      });

      // Receive settings sync from client
      socket.on('settings-sync', (settings: any) => {
        logger.info(`⚙️ Settings sync: API Key: ${settings.apiKey ? 'Set' : 'Empty'}, Resume len: ${settings.resume?.length || 0}`);
        this.eventBus.emit('settings:sync', settings);
        // Sync OTHER clients (e.g. sync phone to desktop or vice versa)
        socket.broadcast.emit('settings-sync', settings);
      });

      socket.on('disconnect', () => {
        logger.info(`🔌 Client disconnected: ${socket.id}`);
      });
    });
  }

  broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  async start() {
    const port = parseInt(process.env.ENGINE_PORT || '3001');
    return new Promise<void>((resolve) => {
      this.httpServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn(`⚠️ Port ${port} is already bound (Engine server already active on port ${port}).`);
          resolve();
        } else {
          logger.error('Http server error:', err);
          resolve();
        }
      });

      this.httpServer.listen(port, '0.0.0.0', () => {
        logger.info(`📡 Engine server listening on port ${port} (0.0.0.0)`);
        resolve();
      });
    });
  }
}
