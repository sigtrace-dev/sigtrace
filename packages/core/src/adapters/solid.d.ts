export * from 'solid-js';
export declare function createSignal<T>(value: T, options?: any): readonly [() => T, (newVal: any) => any];
export declare function createMemo<T>(fn: (v: T | undefined) => T, value?: T, options?: any): () => T;
export declare function createEffect<T>(fn: (v: T | undefined) => T, value?: T, options?: any): void;
