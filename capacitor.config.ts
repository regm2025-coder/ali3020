import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.miad.app",
  appName: "مِيعاد",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    // الأصل الذي تُخدَم منه ملفات التطبيق داخل WebView: https://localhost
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#ffffff",
  },
};

export default config;
