import { Component, useEffect } from "react";

// يلتقط أخطاء العرض في React ويعرض شاشة الخطأ الموحّدة (المعرّفة في index.html) بدل شاشة بيضاء.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    const where = "عرض الواجهة" + (info?.componentStack ? ": " + info.componentStack.split("\n")[1]?.trim() : "");
    if (window.__miadShowFatal) window.__miadShowFatal(error, where);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// يُعلن أن التطبيق بدأ فعلاً، فيُلغي مهلة الأمان في index.html
export function BootDone() {
  useEffect(() => {
    window.__miadBooted = true;
  }, []);
  return null;
}
