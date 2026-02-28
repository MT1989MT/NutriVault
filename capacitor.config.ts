import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nutrivault.app',
  appName: 'NutriVault',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#FAFAF8',
    preferredContentMode: 'mobile'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#FAFAF8',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FAFAF8',
      overlaysWebView: true
    }
  }
};

export default config;
