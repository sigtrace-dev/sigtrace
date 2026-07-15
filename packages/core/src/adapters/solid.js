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
exports.createSignal = createSignal;
exports.createMemo = createMemo;
exports.createEffect = createEffect;
const solid_js_1 = require("solid-js");
__exportStar(require("solid-js"), exports);
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
    // Find unlinked (were in previous, not in current)
    for (const prevDep of previousDeps) {
        if (!currentDeps.has(prevDep)) {
            index_js_1.client.send({
                type: 'unlink',
                fromId: prevDep,
                toId: ownerId
            });
        }
    }
    // Find newly linked (are in current, were not in previous)
    for (const currDep of currentDeps) {
        if (!previousDeps.has(currDep)) {
            index_js_1.client.send({
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
function recordRead(depId) {
    if (runningOwnersStack.length > 0) {
        const currentOwnerId = runningOwnersStack[runningOwnersStack.length - 1];
        currentRunDeps.get(currentOwnerId)?.add(depId);
    }
}
function createSignal(value, options) {
    const signalId = `signal_${Math.random().toString(36).substring(2, 9)}`;
    const name = options?.name || `signal_${signalId.substring(7)}`;
    index_js_1.client.send({
        type: 'register',
        id: signalId,
        name,
        kind: 'signal',
        value,
        loc: options?.__source || null
    });
    const [getter, setter] = (0, solid_js_1.createSignal)(value, options);
    const trackedGetter = () => {
        recordRead(signalId);
        const val = getter();
        index_js_1.client.send({
            type: 'read',
            id: signalId,
            value: val
        });
        return val;
    };
    const trackedSetter = (newVal) => {
        const res = setter(newVal);
        index_js_1.client.send({
            type: 'write',
            id: signalId,
            value: res
        });
        return res;
    };
    return [trackedGetter, trackedSetter];
}
function createMemo(fn, value, options) {
    const memoId = `memo_${Math.random().toString(36).substring(2, 9)}`;
    const name = options?.name || `memo_${memoId.substring(5)}`;
    index_js_1.client.send({
        type: 'register',
        id: memoId,
        name,
        kind: 'memo',
        loc: options?.__source || null
    });
    const trackedFn = (prev) => {
        startOwnerRun(memoId);
        const start = performance.now();
        try {
            const res = fn(prev);
            const duration = performance.now() - start;
            index_js_1.client.send({
                type: 'update',
                id: memoId,
                value: res,
                duration
            });
            return res;
        }
        finally {
            endOwnerRun(memoId);
        }
    };
    const memoGetter = (0, solid_js_1.createMemo)(trackedFn, value, options);
    const trackedMemoGetter = () => {
        recordRead(memoId);
        const val = memoGetter();
        index_js_1.client.send({
            type: 'read',
            id: memoId,
            value: val
        });
        return val;
    };
    return trackedMemoGetter;
}
function createEffect(fn, value, options) {
    const effectId = `effect_${Math.random().toString(36).substring(2, 9)}`;
    const name = options?.name || `effect_${effectId.substring(7)}`;
    index_js_1.client.send({
        type: 'register',
        id: effectId,
        name,
        kind: 'effect',
        loc: options?.__source || null
    });
    const trackedFn = (prev) => {
        startOwnerRun(effectId);
        const start = performance.now();
        try {
            const res = fn(prev);
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
    return (0, solid_js_1.createEffect)(trackedFn, value, options);
}
//# sourceMappingURL=solid.js.map