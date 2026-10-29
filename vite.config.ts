import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { beginnerTrial } from './server/beginner-trial.ts';
export default defineConfig({ plugins: [react(), beginnerTrial()], base: './', worker: { format: 'es' } });
