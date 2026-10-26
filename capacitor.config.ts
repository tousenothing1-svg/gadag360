import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gadag360.gadag360',
  appName: 'GADAG 360',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true
  },
  plugins: {
    Preferences: {
      group: 'gadag360'
    },
    CapacitorUpdater: {
      appId: 'com.gadag360.gadag360'
    }
  }
};

export default config;
