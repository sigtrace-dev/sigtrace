import {
  createSignal as originalCreateSignal,
  createMemo as originalCreateMemo,
  createEffect as originalCreateEffect
} from 'solid-js';
export * from 'solid-js';

import { client } from '../index.js';

const activeOwnerDeps = new Map<string, Set<string>>(); // ownerId -> Set of dependencyIds
const currentRunDeps = new Map<string, Set<string>>();  // ownerId -> Set of dependencyIds
const runningOwnersStack: string[] = [];

function startOwnerRun(ownerId: string) {
  runningOwnersStack.push(ownerId);
  currentRunDeps.set(ownerId, new Set());
}

function endOwnerRun(ownerId: string) {
  runningOwnersStack.pop();
  
  const currentDeps = currentRunDeps.get(ownerId) || new Set<string>();
  const previousDeps = activeOwnerDeps.get(ownerId) || new Set<string>();
  
  // Find unlinked (were in previous, not in current)
  for (const prevDep of previousDeps) {
    if (!currentDeps.has(prevDep)) {
      client.send({
        type: 'unlink',
        fromId: prevDep,
        toId: ownerId
      });
    }
  }
  
  // Find newly linked (are in current, were not in previous)
  for (const currDep of currentDeps) {
    if (!previousDeps.has(currDep)) {
      client.send({
        type: 'link',
        fromId: currDep,
        toId: ownerId
      });
    }
  }
  
  // Save current deps as the active ones
  activeOwnerDeps.set(ownerId, currentDeps);
  currentRunDeps.delete(ownerId);
}

function recordRead(depId: string) {
  if (runningOwnersStack.length > 0) {
    const currentOwnerId = runningOwnersStack[runningOwnersStack.length - 1];
    currentRunDeps.get(currentOwnerId)?.add(depId);
  }
}

export function createSignal<T>(value: T, options?: any) {
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
  
  const [getter, setter] = originalCreateSignal(value, options);
  
  const trackedGetter = () => {
    recordRead(signalId);
    const val = getter();
    client.send({
      type: 'read',
      id: signalId,
      value: val
    });
    return val;
  };
  
  const trackedSetter = (newVal: any) => {
    const res = setter(newVal);
    client.send({
      type: 'write',
      id: signalId,
      value: res
    });
    return res;
  };
  
  return [trackedGetter, trackedSetter] as const;
}

export function createMemo<T>(fn: (v: T | undefined) => T, value?: T, options?: any) {
  const memoId = `memo_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `memo_${memoId.substring(5)}`;
  
  client.send({
    type: 'register',
    id: memoId,
    name,
    kind: 'memo',
    loc: options?.__source || null,
    component: options?.component || null
  });
  
  const trackedFn = (prev: T | undefined) => {
    startOwnerRun(memoId);
    const start = performance.now();
    try {
      const res = fn(prev);
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
  
  const memoGetter = originalCreateMemo(trackedFn, value, options);
  
  const trackedMemoGetter = () => {
    recordRead(memoId);
    const val = memoGetter();
    client.send({
      type: 'read',
      id: memoId,
      value: val
    });
    return val;
  };
  
  return trackedMemoGetter;
}

export function createEffect<T>(fn: (v: T | undefined) => T, value?: T, options?: any) {
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
  
  const trackedFn = (prev: T | undefined) => {
    startOwnerRun(effectId);
    const start = performance.now();
    try {
      const res = fn(prev);
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
  
  return originalCreateEffect(trackedFn, value, options);
}
