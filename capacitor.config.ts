import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.hoangnamaudio.app',
  appName: 'Hoang Nam Audio',
  webDir: 'dist',
  // ⚠️ KHÔNG bật server.url khi build production — sẽ bị App Store reject (4.2)
  // Khi cần dev live-reload, tạm thời thêm vào nhưng đừng commit
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'hoangnamaudio',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#15803d',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#15803d',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
