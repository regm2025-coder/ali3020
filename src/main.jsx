import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.jsx";
import "./style.css";

// Web Push service workers are for the browser/PWA build.
// Capacitor Android uses a native WebView and should not register the PWA worker.
if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Keep the install prompt only in supported browser contexts.
if (!Capacitor.isNativePlatform()) {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__miadInstallPrompt = event;
    window.dispatchEvent(new Event("miad-install-ready"));
  });

  window.addEventListener("appinstalled", () => {
    window.__miadInstallPrompt = null;
    window.dispatchEvent(new Event("miad-install-ready"));
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
