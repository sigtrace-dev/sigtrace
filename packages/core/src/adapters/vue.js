"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ref = ref;
exports.computed = computed;
exports.watchEffect = watchEffect;
const vue_1 = require("vue");
__exportStar(require("vue"), exports);
const index_js_1 = require("../index.js");
const activeOwnerDeps = new Map(); // ownerId -> Set of dependencyIds
const currentRunDeps = new Map(); // ownerId -> Set of dependencyIds
const runningOwnersStack = [];
function startOwnerRun(ownerId) {
    runningOwnersStack.push(ownerId);
    currentRunDeps.set(ownerId, new Set());
}
function endOwnerRun(ownerId) {
    runningOwnersStack.pop();
    const currentDeps = currentRunDeps.get(ownerId) || new Set();
    const previousDeps = activeOwnerDeps.get(ownerId) || new Set();
    // Find unlinked
    for (const prevDep of previousDeps) {
        if (!currentDeps.has(prevDep)) {
            index_js_1.client.send({
                type: 'unlink',
                fromId: prevDep,
                toId: ownerId
            });
        }
    }
    // Find newly linked
    for (const currDep of currentDeps) {
        if (!previousDeps.has(currDep)) {
            index_js_1.client.send({
                type: 'link',
                fromId: currDep,
                toId: ownerId
            });
        }
    }
    activeOwnerDeps.set(ownerId, currentDeps);
    currentRunDeps.delete(ownerId);
}
function recordRead(depId) {
    if (runningOwnersStack.length > 0) {
        const currentOwnerId = runningOwnersStack[runningOwnersStack.length - 1];
        currentRunDeps.get(currentOwnerId)?.add(depId);
    }
}
function ref(value, options) {
    const refId = `ref_${Math.random().toString(36).substring(2, 9)}`;
    const name = options?.name || `ref_${refId.substring(4)}`;
    index_js_1.client.send({
        type: 'register',
        id: refId,
        name,
        kind: 'signal',
        value,
        loc: options?.__source || null
    });
    const r = (0, vue_1.ref)(value);
    return new Proxy(r, {
        get(target, prop, receiver) {
            if (prop === '__sigtrace_id__')
                return refId;
            if (prop === 'value') {
                recordRead(refId);
                const val = Reflect.get(target, prop, receiver);
                index_js_1.client.send({
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
                index_js_1.client.send({
                    type: 'write',
                    id: refId,
                    value: newVal
                });
                return res;
            }
            return Reflect.set(target, prop, newVal, receiver);
        }
    });
}
function computed(getterOrOptions, debugOptions) {
    const computedId = `computed_${Math.random().toString(36).substring(2, 9)}`;
    const name = debugOptions?.name || `computed_${computedId.substring(9)}`;
    index_js_1.client.send({
        type: 'register',
        id: computedId,
        name,
        kind: 'memo',
        loc: debugOptions?.__source || null
    });
    const getter = typeof getterOrOptions === 'function' ? getterOrOptions : getterOrOptions.get;
    const trackedGetter = () => {
        startOwnerRun(computedId);
        const start = performance.now();
        try {
            const res = getter();
            const duration = performance.now() - start;
            index_js_1.client.send({
                type: 'update',
                id: computedId,
                value: res,
                duration
            });
            return res;
        }
        finally {
            endOwnerRun(computedId);
        }
    };
    const c = (0, vue_1.computed)(typeof getterOrOptions === 'function'
        ? trackedGetter
        : { get: trackedGetter, set: getterOrOptions.set });
    return new Proxy(c, {
        get(target, prop, receiver) {
            if (prop === '__sigtrace_id__')
                return computedId;
            if (prop === 'value') {
                recordRead(computedId);
                const val = Reflect.get(target, prop, receiver);
                index_js_1.client.send({
                    type: 'read',
                    id: computedId,
                    value: val
                });
                return val;
            }
            return Reflect.get(target, prop, receiver);
        }
    });
}
function watchEffect(effectFn, options) {
    const effectId = `effect_${Math.random().toString(36).substring(2, 9)}`;
    const name = options?.name || `effect_${effectId.substring(7)}`;
    index_js_1.client.send({
        type: 'register',
        id: effectId,
        name,
        kind: 'effect',
        loc: options?.__source || null
    });
    const trackedFn = (onCleanup) => {
        startOwnerRun(effectId);
        const start = performance.now();
        try {
            const res = effectFn(onCleanup);
            const duration = performance.now() - start;
            index_js_1.client.send({
                type: 'update',
                id: effectId,
                duration
            });
            return res;
        }
        finally {
            endOwnerRun(effectId);
        }
    };
    return (0, vue_1.watchEffect)(trackedFn, options);
}
//# sourceMappingURL=vue.js.map