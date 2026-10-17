import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser 本体（minify 後 約 1.7 MB・gzip 約 380 KB）は更新頻度が低いので別ファイルにしてキャッシュを効かせる
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
});
