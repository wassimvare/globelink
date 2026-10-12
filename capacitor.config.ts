import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.globelink.mobile',
  appName: 'GlobeLink',
  // Step 3 is an online device-test build. TanStack Start needs its server;
  // the SSR output is not a standalone bundle that can run inside Capacitor.
  // Replace server.url with a bundled mobile client before store distribution.
  webDir: 'mobile/web',
  appendUserAgent: ' GlobeLinkNativeTest/1.0',
  server: {
    url: 'https://globelink-theta.vercel.app',
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
    resolveServiceWorkerRequests: false,
  },
};

export default config;
