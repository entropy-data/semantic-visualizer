import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/main.jsx'),
      // An app build drops the entry's exports, since nothing inside the bundle uses them — which
      // silently removed `init` and would have made `import { init }` fail in the browser, on the one
      // page that needs it, with nothing failing at build time. The auto-mount still runs either way.
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: 'assets/index.js',
        assetFileNames: 'assets/index.css',
      },
    },
  },
});
