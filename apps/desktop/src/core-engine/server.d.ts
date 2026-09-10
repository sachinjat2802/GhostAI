import { EventBus } from './utils/EventBus';
import { ContextService } from './context/ContextService';
export declare class EngineServer {
    private app;
    private httpServer;
    private io;
    private eventBus;
    private contextService?;
    constructor(eventBus: EventBus, contextService?: ContextService);
    private setupRoutes;
    private setupSocketHandlers;
    broadcast(event: string, data: any): void;
    start(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map