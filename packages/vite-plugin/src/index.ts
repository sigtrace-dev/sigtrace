import type { Plugin } from 'vite';
import { transformCode } from './transform.js';

export interface SigTracePluginOptions {
  enabled?: boolean;
  port?: number;
}

export function sigTrace(options?: SigTracePluginOptions): Plugin {
  const enabled = options?.enabled !== false;
  const port = options?.port || 8420;

  return {
    name: 'sigtrace',
    apply: 'serve', // only run in dev server mode

    config() {
      if (!enabled) return;
      return {
        define: {
          __SIGTRACE_PORT__: port
        }
      };
    },

    resolveId(source: string, importer: string | undefined) {
      if (!enabled) return null;

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

      if (source === '@angular/core') {
        if (importer && (importer.includes('@sigtrace/core') || importer.includes('packages/core'))) {
          return null; // Use original
        }
        return this.resolve('@sigtrace/core/angular', importer, { skipSelf: true });
      }

      return null;
    },

    transform(code: string, id: string) {
      if (!enabled) return null;

      // Process only project source files, exclude node_modules and output files
      if (
        id.includes('node_modules') || 
        id.includes('dist') || 
        (!id.endsWith('.ts') && !id.endsWith('.tsx') && !id.endsWith('.js') && !id.endsWith('.jsx') && !id.endsWith('.vue') && !id.endsWith('.svelte'))
      ) {
        return null;
      }

      const transformed = transformCode(code, id);
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
