// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Web interna: sin indexar y sin integraciones externas.
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
