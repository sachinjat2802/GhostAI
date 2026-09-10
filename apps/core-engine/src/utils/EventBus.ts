import { EventEmitter } from 'events';

/**
 * EventBus - Central pub/sub for all engine events
 * This decouples all services from each other
 */
export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}
