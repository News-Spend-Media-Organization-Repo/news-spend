"use client";

import { useField } from "@payloadcms/ui";
import type { CodeFieldClientProps } from "payload";
import type { ReactNode } from "react";
import { Component, lazy, Suspense, useState } from "react";

class StudioErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.failed) {
      return null;
    }
    return this.props.children;
  }
}

const createStudio = () =>
  lazy(() =>
    import("./EmailStudio").then((mod) => ({ default: mod.EmailStudio }))
  );

/**
 * Visual editor for the `html` field.
 * Full studio: TipTap canvas, bubble menu, slash commands (including
 * template Variables), image uploads to Media, and an Inspector sidebar.
 * Lazy-loaded so the editor bundle only loads when an admin opens a
 * visual template. A load failure shows a friendly retry, never raw code.
 */
export function EmailVisualEditor({ path }: CodeFieldClientProps) {
  const { setValue, value } = useField<string>({ path });
  const [failed, setFailed] = useState(false);
  // Fresh lazy component per retry: React caches the first import result,
  // so retrying needs a new component identity to refetch the chunk.
  const [studioState, setStudioState] = useState(() => ({
    key: 0,
    Studio: createStudio(),
  }));

  if (failed) {
    return (
      <div className="email-studio-load-error">
        <p>The visual editor couldn&apos;t load.</p>
        <button
          onClick={() => {
            setFailed(false);
            setStudioState((prev) => ({
              key: prev.key + 1,
              Studio: createStudio(),
            }));
          }}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <StudioErrorBoundary
      key={studioState.key}
      onError={() => {
        setFailed(true);
      }}
    >
      <Suspense fallback={<p>Loading visual editor…</p>}>
        <studioState.Studio initialHtml={value ?? ""} onSave={setValue} />
      </Suspense>
    </StudioErrorBoundary>
  );
}
