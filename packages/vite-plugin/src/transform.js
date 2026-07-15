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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformCode = transformCode;
const parser_1 = __importDefault(require("@babel/parser"));
// @ts-ignore
const traverse_1 = __importDefault(require("@babel/traverse"));
// @ts-ignore
const generator_1 = __importDefault(require("@babel/generator"));
const t = __importStar(require("@babel/types"));
const traverse = (traverse_1.default.default || traverse_1.default);
const generate = (generator_1.default.default || generator_1.default);
function transformCode(code, filename) {
    // Only process if it contains relevant primitives
    if (!code.includes('createSignal') &&
        !code.includes('createMemo') &&
        !code.includes('createEffect') &&
        !code.includes('ref') &&
        !code.includes('computed') &&
        !code.includes('watchEffect')) {
        return code;
    }
    // Skip node_modules or output bundles
    if (filename.includes('node_modules') || filename.includes('dist')) {
        return code;
    }
    try {
        const ast = parser_1.default.parse(code, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx']
        });
        traverse(ast, {
            CallExpression(path) {
                const callee = path.node.callee;
                let funcName = '';
                if (t.isIdentifier(callee)) {
                    funcName = callee.name;
                }
                else if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
                    funcName = callee.property.name;
                }
                const validFuncs = ['createSignal', 'createMemo', 'createEffect', 'ref', 'computed', 'watchEffect'];
                if (!validFuncs.includes(funcName))
                    return;
                // Get location
                const loc = path.node.loc;
                const line = loc ? loc.start.line : 0;
                const column = loc ? loc.start.column : 0;
                // Extract name
                let varName = '';
                const parent = path.parentPath;
                if (parent && parent.isVariableDeclarator()) {
                    const id = parent.node.id;
                    if (t.isArrayPattern(id)) {
                        // const [count, setCount] = createSignal(0)
                        if (id.elements[0] && t.isIdentifier(id.elements[0])) {
                            varName = id.elements[0].name;
                        }
                    }
                    else if (t.isIdentifier(id)) {
                        // const count = ref(0)
                        varName = id.name;
                    }
                }
                if (!varName) {
                    varName = `${funcName}_line${line}`;
                }
                const sourceLocNode = t.objectExpression([
                    t.objectProperty(t.identifier('file'), t.stringLiteral(filename)),
                    t.objectProperty(t.identifier('line'), t.numericLiteral(line)),
                    t.objectProperty(t.identifier('column'), t.numericLiteral(column))
                ]);
                const debugObj = t.objectExpression([
                    t.objectProperty(t.identifier('name'), t.stringLiteral(varName)),
                    t.objectProperty(t.identifier('__source'), sourceLocNode)
                ]);
                if (funcName === 'createSignal' || funcName === 'ref') {
                    // Injection for 2nd arg: createSignal(value, options) / ref(value, options)
                    if (path.node.arguments.length === 0) {
                        path.node.arguments.push(t.identifier('undefined'));
                    }
                    if (path.node.arguments.length === 1) {
                        path.node.arguments.push(debugObj);
                    }
                    else if (path.node.arguments.length >= 2) {
                        const originalOpts = path.node.arguments[1];
                        if (t.isObjectExpression(originalOpts)) {
                            // check if name already exists
                            const nameProp = originalOpts.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
                            if (!nameProp) {
                                originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
                            }
                            originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
                        }
                    }
                }
                else if (funcName === 'createMemo' || funcName === 'createEffect') {
                    // Injection for 3rd arg: createMemo(fn, value, options)
                    while (path.node.arguments.length < 2) {
                        path.node.arguments.push(t.identifier('undefined'));
                    }
                    if (path.node.arguments.length === 2) {
                        path.node.arguments.push(debugObj);
                    }
                    else if (path.node.arguments.length >= 3) {
                        const originalOpts = path.node.arguments[2];
                        if (t.isObjectExpression(originalOpts)) {
                            const nameProp = originalOpts.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
                            if (!nameProp) {
                                originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
                            }
                            originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
                        }
                    }
                }
                else if (funcName === 'computed' || funcName === 'watchEffect') {
                    // Injection for 2nd arg: computed(fn, options) / watchEffect(fn, options)
                    if (path.node.arguments.length === 1) {
                        path.node.arguments.push(debugObj);
                    }
                    else if (path.node.arguments.length >= 2) {
                        const originalOpts = path.node.arguments[1];
                        if (t.isObjectExpression(originalOpts)) {
                            const nameProp = originalOpts.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'name');
                            if (!nameProp) {
                                originalOpts.properties.push(t.objectProperty(t.identifier('name'), t.stringLiteral(varName)));
                            }
                            originalOpts.properties.push(t.objectProperty(t.identifier('__source'), sourceLocNode));
                        }
                    }
                }
            }
        });
        const output = generate(ast, {}, code);
        return output.code;
    }
    catch (err) {
        console.error(`[SigTrace Compile Error] Failed to process ${filename}:`, err);
        return code;
    }
}
//# sourceMappingURL=transform.js.map