"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sigTrace = sigTrace;
const transform_js_1 = require("./transform.js");
function sigTrace(options) {
    const enabled = options?.enabled !== false;
    const port = options?.port || 8420;
    return {
        name: 'sigtrace',
        apply: 'serve', // only run in dev server mode
        config() {
            if (!enabled)
                return;
            return {
                define: {
                    __SIGTRACE_PORT__: port
                }
            };
        },
        resolveId(source, importer) {
            if (!enabled)
                return null;
            // Handle redirecting framework imports to our wrappers
            // We check importer to avoid infinite loops when our core package imports the original package.
            if (source === 'solid-js') {
                if (importer && (importer.includes('@sigtrace/core') || importer.includes('packages/core'))) {
                    return null; // Use original
                }
                return this.resolve('@sigtrace/core/solid', importer, { skipSelf: true });
            }
            if (source === 'vue') {
                if (importer && (importer.includes('@sigtrace/core') || importer.includes('packages/core'))) {
                    return null; // Use original
                }
                return this.resolve('@sigtrace/core/vue', importer, { skipSelf: true });
            }
            return null;
        },
        transform(code, id) {
            if (!enabled)
                return null;
            // Process only project source files, exclude node_modules and output files
            if (id.includes('node_modules') ||
                id.includes('dist') ||
                (!id.endsWith('.ts') && !id.endsWith('.tsx') && !id.endsWith('.js') && !id.endsWith('.jsx') && !id.endsWith('.vue') && !id.endsWith('.svelte'))) {
                return null;
            }
            const transformed = (0, transform_js_1.transformCode)(code, id);
            if (transformed !== code) {
                return {
                    code: transformed,
                    map: null // simplified for dev tracking
                };
            }
            return null;
        }
    };
}
//# sourceMappingURL=index.js.map