import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['mavis-untolerating-overcarefully.ngrok-free.dev'], 
  },
});
