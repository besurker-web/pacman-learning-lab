import { defineConfig } from 'vitest/config';
export default defineConfig({ server: { port: 5173, strictPort: true }, test: { include: ['tests/**/*.test.ts'], testTimeout: 30000 } });
