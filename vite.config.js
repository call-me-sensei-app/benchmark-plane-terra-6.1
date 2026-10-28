import { defineConfig } from 'vite';

// The local preview (server.py) serves the modules unbundled and maps the bare `three` imports with the import map in
// index.html. A Vite build bundles those imports itself, so the import map is removed from the built page: a page
// hosted under a strict script policy may run its entry module only.
const dropImportMap = {
  name: 'drop-import-map',
  apply: 'build',
  transformIndexHtml: { order: 'pre', handler: html => html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '') },
};

// assetsInlineLimit 0: files such as usage-final.json are fetched, and a hosting policy need not allow data: URLs.
export default defineConfig({ plugins: [dropImportMap], build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 } });
