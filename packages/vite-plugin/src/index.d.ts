import { Plugin } from 'vite';
export interface SigTracePluginOptions {
    enabled?: boolean;
    port?: number;
}
export declare function sigTrace(options?: SigTracePluginOptions): Plugin;
