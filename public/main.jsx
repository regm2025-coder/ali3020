import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./style.css";

// تسجيل الـ Service Worker ليعمل التطبيق كتطبيق قابل للتثبيت
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// نحتفظ بطلب التثبيت ليظهر زر «تثبيت التطبيق» في شاشة حسابي
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__miadInstallPrompt = event;
  window.dispatchEvent(new Event("miad-install-ready"));
});

window.addEventListener("appinstalled", () => {
  window.__miadInstallPrompt = null;
  window.dispatchEvent(new Event("miad-install-ready"));
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
