"use client";
import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Keeps one failing section from taking the whole page with it. A crash inside
 * the photo picker, a chart or an editor panel is a local problem and is
 * reported where it happened, with the rest of the page still usable.
 */
export class SectionBoundary extends Component<
  { children: ReactNode; title?: string; hint?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // The digest/stack belongs in the browser console, not in the UI.
    console.error("section boundary", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card p-5" role="alert">
        <h2 className="flex items-center gap-2">
          <AlertTriangle size={18} />
          {this.props.title ?? "تعذر عرض هذا الجزء"}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted">
          {this.props.hint ?? "بقية الصفحة تعمل. أعد المحاولة، وإذا تكرر الأمر تواصل مع الدعم."}
        </p>
        <button type="button" className="btn mt-4" onClick={() => this.setState({ failed: false })}>
          إعادة المحاولة
        </button>
      </section>
    );
  }
}
