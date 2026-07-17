import {
  // @ts-ignore
  state as originalState,
  // @ts-ignore
  derived as originalDerived,
  // @ts-ignore
  effect as originalEffect
} from 'svelte';
export * from 'svelte';

import { client } from '../index.js';

const activeOwnerDeps = new Map<string, Set<string>>();
const currentRunDeps = new Map<string, Set<string>>();
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
  
  for (const prevDep of previousDeps) {
    if (!currentDeps.has(prevDep)) {
      client.send({
        type: 'unlink',
        fromId: prevDep,
        toId: ownerId
      });
    }
  }
  
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

// @ts-ignore
export function state<T>(initialValue: T, options?: any) {
  const signalId = `state_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `state_${signalId.substring(6)}`;

  client.send({
    type: 'register',
    id: signalId,
    name,
    kind: 'signal',
    value: initialValue,
    loc: options?.__source || null,
    component: options?.component || null
  });

  // @ts-ignore
  const s = originalState(initialValue);

  return new Proxy(s, {
    get(target, prop, receiver) {
      if (prop === 'value') {
        recordRead(signalId);
        const val = Reflect.get(target, prop, receiver);
        client.send({
          type: 'read',
          id: signalId,
          value: val
        });
        return val;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (prop === 'value') {
        const res = Reflect.set(target, prop, value, receiver);
        client.send({
          type: 'write',
          id: signalId,
          value: value
        });
        return res;
      }
      return Reflect.set(target, prop, value, receiver);
    }
  });
}

// @ts-ignore
export function derived<T>(fn: () => T, options?: any) {
  const memoId = `derived_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `derived_${memoId.substring(8)}`;

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

  // @ts-ignore
  const d = originalDerived(trackedFn);

  return new Proxy(d, {
    get(target, prop, receiver) {
      if (prop === 'value') {
        recordRead(memoId);
        const val = Reflect.get(target, prop, receiver);
        client.send({
          type: 'read',
          id: memoId,
          value: val
        });
        return val;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

// @ts-ignore
export function effect(fn: () => void, options?: any) {
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

  // @ts-ignore
  return originalEffect(trackedFn);
}
