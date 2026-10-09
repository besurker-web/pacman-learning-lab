import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/browser',fullyParallel:false,use:{baseURL:'http://localhost:5173',headless:true,channel:'chrome'},webServer:{command:'npm run dev',url:'http://localhost:5173',reuseExistingServer:true},timeout:60000});
