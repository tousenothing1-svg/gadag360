import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.royalharvest.app',
  appName: 'Royal Harvest',
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
      group: 'royalharvest'
    },
    CapacitorUpdater: {
      appId: 'in.royalharvest.app'
    }
  }
};

export default config;
