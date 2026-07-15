import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { sigTrace } from '@sigtrace/vite';

export default defineConfig({
  plugins: [
    sigTrace({
      enabled: true,
      port: 8420
    }),
    solidPlugin()
  ],
  server: {
    port: 3000
  }
});
