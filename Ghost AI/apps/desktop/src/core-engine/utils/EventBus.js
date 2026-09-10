"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
const events_1 = require("events");
/**
 * EventBus - Central pub/sub for all engine events
 * This decouples all services from each other
 */
class EventBus extends events_1.EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=EventBus.js.map