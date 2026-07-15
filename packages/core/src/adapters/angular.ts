import {
  signal as originalSignal,
  computed as originalComputed,
  effect as originalEffect,
  model as originalModel
} from '@angular/core';
export * from '@angular/core';

import { client } from '../index.js';

const activeOwnerDeps = new Map<string, Set<string>>(); // ownerId -> Set of dependencyIds
const currentRunDeps = new Map<string, Set<string>>();  // ownerId -> Set of dependencyIds
const runningOwnersStack: string[] = [];

// FinalizationRegistry for dynamic garbage collection and cleanup of nodes
const registry = new FinalizationRegistry((heldValue: { id: string, component: string }) => {
  client.send({
    type: 'destroy',
    id: heldValue.id,
    component: heldValue.component
  });
});

function startOwnerRun(ownerId: string) {
  runningOwnersStack.push(ownerId);
  currentRunDeps.set(ownerId, new Set());
}

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

export function recordRead(depId: string) {
  if (runningOwnersStack.length > 0) {
    const currentOwnerId = runningOwnersStack[runningOwnersStack.length - 1];
    currentRunDeps.get(currentOwnerId)?.add(depId);
  }
}

export function signal<T>(initialValue: T, options?: any) {
  const signalId = `signal_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `signal_${signalId.substring(7)}`;

  client.send({
    type: 'register',
    id: signalId,
    name,
    kind: 'signal',
    value: initialValue,
    loc: options?.__source || null,
    component: options?.component || null
  });

  const originalSig = originalSignal(initialValue, options);

  const trackedSignal = (() => {
    recordRead(signalId);
    return originalSig();
  }) as any;

  trackedSignal.set = (newVal: any) => {
    originalSig.set(newVal);
    client.send({
      type: 'write',
      id: signalId,
      value: newVal
    });
  };

  trackedSignal.update = (updateFn: any) => {
    originalSig.update((prev: any) => {
      const next = updateFn(prev);
      client.send({
        type: 'write',
        id: signalId,
        value: next
      });
      return next;
    });
  };

  trackedSignal.asReadonly = () => {
    const readonlySig = (() => {
      recordRead(signalId);
      return originalSig();
    }) as any;
    registry.register(readonlySig, { id: signalId, component: options?.component || null });
    return readonlySig;
  };

  registry.register(trackedSignal, { id: signalId, component: options?.component || null });

  return trackedSignal;
}

export function computed<T>(fn: () => T, options?: any) {
  const computedId = `computed_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `computed_${computedId.substring(9)}`;

  client.send({
    type: 'register',
    id: computedId,
    name,
    kind: 'memo',
    loc: options?.__source || null,
    component: options?.component || null
  });

  const trackedFn = () => {
    startOwnerRun(computedId);
    const start = performance.now();
    try {
      const res = fn();
      const duration = performance.now() - start;
      client.send({
        type: 'update',
        id: computedId,
        value: res,
        duration
      });
      return res;
    } finally {
      endOwnerRun(computedId);
    }
  };

  const originalComp = originalComputed(trackedFn, options);

  const trackedComputed = (() => {
    recordRead(computedId);
    return originalComp();
  }) as any;

  registry.register(trackedComputed, { id: computedId, component: options?.component || null });

  return trackedComputed;
}

export function effect(fn: (onCleanup: any) => void, options?: any) {
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

  const trackedFn = (onCleanup: any) => {
    startOwnerRun(effectId);
    const start = performance.now();
    try {
      fn(onCleanup);
      const duration = performance.now() - start;
      client.send({
        type: 'update',
        id: effectId,
        duration
      });
    } finally {
      endOwnerRun(effectId);
    }
  };

  const ref = originalEffect(trackedFn, options);
  registry.register(ref, { id: effectId, component: options?.component || null });
  return ref;
}

export function model<T>(initialValue?: T, options?: any) {
  if (!originalModel) {
    throw new Error('[SigTrace] model() is not supported in this version of Angular. Please upgrade to Angular 17.2+');
  }
  const signalId = `model_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `model_${signalId.substring(6)}`;

  client.send({
    type: 'register',
    id: signalId,
    name,
    kind: 'signal',
    value: initialValue,
    loc: options?.__source || null,
    component: options?.component || null
  });

  const originalSig = originalModel(initialValue, options);

  const trackedSignal = (() => {
    recordRead(signalId);
    return originalSig();
  }) as any;

  trackedSignal.set = (newVal: any) => {
    originalSig.set(newVal);
    client.send({
      type: 'write',
      id: signalId,
      value: newVal
    });
  };

  trackedSignal.update = (updateFn: any) => {
    originalSig.update((prev: any) => {
      const next = updateFn(prev);
      client.send({
        type: 'write',
        id: signalId,
        value: next
      });
      return next;
    });
  };

  trackedSignal.asReadonly = () => {
    const readonlySig = (() => {
      recordRead(signalId);
      return originalSig();
    }) as any;
    registry.register(readonlySig, { id: signalId, component: options?.component || null });
    return readonlySig;
  };

  registry.register(trackedSignal, { id: signalId, component: options?.component || null });

  return trackedSignal;
}
