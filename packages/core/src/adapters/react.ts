import {
  signal as originalSignal,
  computed as originalComputed,
  effect as originalEffect,
  Signal
} from '@preact/signals-react';
export * from '@preact/signals-react';

import { client } from '../index.js';

const activeOwnerDeps = new Map<string, Set<string>>(); // ownerId -> Set of dependencyIds
const currentRunDeps = new Map<string, Set<string>>();  // ownerId -> Set of dependencyIds
const runningOwnersStack: string[] = [];

function startOwnerRun(ownerId: string) {
  runningOwnersStack.push(ownerId);
  currentRunDeps.set(ownerId, new Set());
}

// @ts-ignore
function endOwnerRun(ownerId: string) {
  runningOwnersStack.pop();
  
  const currentDeps = currentRunDeps.get(ownerId) || new Set<string>();
  const previousDeps = activeOwnerDeps.get(ownerId) || new Set<string>();
  
  // Find unlinked
  for (const prevDep of previousDeps) {
    if (!currentDeps.has(prevDep)) {
      client.send({
        type: 'unlink',
        fromId: prevDep,
        toId: ownerId
      });
    }
  }
  
  // Find newly linked
  for (const currDep of currentDeps) {
    if (!previousDeps.has(currDep)) {
      client.send({
        type: 'link',
        fromId: currDep,
        toId: ownerId
      });
    }
  }
  
  activeOwnerDeps.set(ownerId, currentDeps);
  currentRunDeps.delete(ownerId);
}

function recordRead(depId: string) {
  if (runningOwnersStack.length > 0) {
    const currentOwnerId = runningOwnersStack[runningOwnersStack.length - 1];
    currentRunDeps.get(currentOwnerId)?.add(depId);
  }
}

export function signal<T>(value: T, options?: any): Signal<T> {
  const signalId = `signal_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `signal_${signalId.substring(7)}`;

  client.send({
    type: 'register',
    id: signalId,
    name,
    kind: 'signal',
    value,
    loc: options?.__source || null,
    component: options?.component || null
  });

  const sig = originalSignal(value);

  // We define property interceptor on the signal's value getter/setter
  Object.defineProperty(sig, 'value', {
    get() {
      recordRead(signalId);
      // Retrieve value via standard Preact signals prototype
      const val = Object.getOwnPropertyDescriptor(Signal.prototype, 'value')?.get?.call(sig);
      client.send({
        type: 'read',
        id: signalId,
        value: val
      });
      return val;
    },
    set(newVal: T) {
      Object.getOwnPropertyDescriptor(Signal.prototype, 'value')?.set?.call(sig, newVal);
      client.send({
        type: 'write',
        id: signalId,
        value: newVal
      });
    }
  });

  return sig;
}

export function computed<T>(fn: () => T, options?: any): Signal<T> {
  const memoId = `computed_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `computed_${memoId.substring(9)}`;

  client.send({
    type: 'register',
    id: memoId,
    name,
    kind: 'memo',
    loc: options?.__source || null,
    component: options?.component || null
  });

  const trackedFn = () => {
    startOwnerRun(memoId);
    const start = performance.now();
    try {
      const res = fn();
      const duration = performance.now() - start;
      client.send({
        type: 'update',
        id: memoId,
        value: res,
        duration
      });
      return res;
    } finally {
      endOwnerRun(memoId);
    }
  };

  const comp = originalComputed(trackedFn);

  // Intercept reads on computed
  Object.defineProperty(comp, 'value', {
    get() {
      recordRead(memoId);
      const val = Object.getOwnPropertyDescriptor(Signal.prototype, 'value')?.get?.call(comp);
      client.send({
        type: 'read',
        id: memoId,
        value: val
      });
      return val;
    }
  });

  return comp;
}

export function effect(fn: () => void, options?: any): () => void {
  const effectId = `effect_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `effect_${effectId.substring(7)}`;

  client.send({
    type: 'register',
    id: effectId,
    name,
    kind: 'effect',
    loc: options?.__source || null,
    component: options?.component || null
  });

  const trackedFn = () => {
    startOwnerRun(effectId);
    const start = performance.now();
    try {
      const res = fn();
      const duration = performance.now() - start;
      client.send({
        type: 'update',
        id: effectId,
        duration
      });
      return res;
    } finally {
      endOwnerRun(effectId);
    }
  };

  return originalEffect(trackedFn);
}
