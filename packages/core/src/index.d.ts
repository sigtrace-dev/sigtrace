import { TraceEvent } from './types.js';
declare global {
    const __SIGTRACE_PORT__: number | undefined;
}
declare class SigTraceClient {
    private ws;
    private queue;
    private isConnecting;
    private port;
    constructor();
    private connect;
    send(event: TraceEvent): void;
    private flushQueue;
}
export declare const client: SigTraceClient;
export * from './types.js';
