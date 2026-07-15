import {
  ref as originalRef,
  computed as originalComputed,
  watchEffect as originalWatchEffect
} from 'vue';
export * from 'vue';

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

export function ref<T>(value: T, options?: any) {
  const refId = `ref_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `ref_${refId.substring(4)}`;
  
  client.send({
    type: 'register',
    id: refId,
    name,
    kind: 'signal',
    value,
    loc: options?.__source || null,
    component: options?.component || null
  });
  
  const r = originalRef(value);
  
  return new Proxy(r, {
    get(target, prop, receiver) {
      if (prop === '__sigtrace_id__') return refId;
      if (prop === 'value') {
        recordRead(refId);
        const val = Reflect.get(target, prop, receiver);
        client.send({
          type: 'read',
          id: refId,
          value: val
        });
        return val;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, newVal, receiver) {
      if (prop === 'value') {
        const res = Reflect.set(target, prop, newVal, receiver);
        client.send({
          type: 'write',
          id: refId,
          value: newVal
        });
        return res;
      }
      return Reflect.set(target, prop, newVal, receiver);
    }
  }) as any;
}

export function computed<T>(getterOrOptions: any, debugOptions?: any) {
  const computedId = `computed_${Math.random().toString(36).substring(2, 9)}`;
  const name = debugOptions?.name || `computed_${computedId.substring(9)}`;
  
  client.send({
    type: 'register',
    id: computedId,
    name,
    kind: 'memo',
    loc: debugOptions?.__source || null,
    component: debugOptions?.component || null
  });
  
  const getter = typeof getterOrOptions === 'function' ? getterOrOptions : getterOrOptions.get;
  
  const trackedGetter = () => {
    startOwnerRun(computedId);
    const start = performance.now();
    try {
      const res = getter();
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
  
  let c;
  if (typeof getterOrOptions === 'function') {
    c = originalComputed(trackedGetter);
  } else {
    c = originalComputed({
      get: trackedGetter,
      set: getterOrOptions.set
    });
  }
  
  return new Proxy(c, {
    get(target, prop, receiver) {
      if (prop === '__sigtrace_id__') return computedId;
      if (prop === 'value') {
        recordRead(computedId);
        const val = Reflect.get(target, prop, receiver);
        client.send({
          type: 'read',
          id: computedId,
          value: val
        });
        return val;
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as any;
}

export function watchEffect(effectFn: any, options?: any) {
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
      const res = effectFn(onCleanup);
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
  
  return originalWatchEffect(trackedFn, options);
}
