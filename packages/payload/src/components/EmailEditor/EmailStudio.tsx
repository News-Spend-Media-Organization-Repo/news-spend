"use client";

import { Button, Popup, useDocumentInfo } from "@payloadcms/ui";
import { composeReactEmail } from "@react-email/editor/core";
import { StarterKit } from "@react-email/editor/extensions";
import {
  EmailTheming,
  imageSlashCommand,
  useEditorImage,
} from "@react-email/editor/plugins";
import {
  BubbleMenu,
  defaultSlashCommands,
  Inspector,
  SlashCommand,
  type SlashCommandItem,
  TypeIcon,
} from "@react-email/editor/ui";
import type { Content, Editor } from "@tiptap/core";
import { EditorProvider, useCurrentEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  sampleVariables,
  TEMPLATE_VARIABLES,
} from "../../lib/email/templateVariables";

async function uploadImageToMedia(file: File): Promise<{ url: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be under 5MB.");
  }
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/media", { body: form, method: "POST" });
  if (!res.ok) {
    throw new Error("Image upload failed. Try again.");
  }
  const doc = (await res.json()) as { url?: string | null };
  if (!doc.url) {
    throw new Error("Image upload returned no URL.");
  }
  return { url: doc.url };
}

function toVariableItems(): SlashCommandItem[] {
  return TEMPLATE_VARIABLES.map((variable) => ({
    category: "Variables",
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(`{{${variable.key}}}`)
        .run();
    },
    description: `${variable.description} Inserts {{${variable.key}}}.`,
    icon: <TypeIcon />,
    searchTerms: ["variable", "merge", "placeholder", variable.key],
    title: variable.label,
  }));
}

function TestSendPopup() {
  const { id } = useDocumentInfo();
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<{
    kind: "ok" | "error";
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!id) {
    return null;
  }

  const handleSend = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/email-templates/${id}/test-send`, {
        body: JSON.stringify({ to, variables: sampleVariables() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!(res.ok && data.ok)) {
        setStatus({ kind: "error", message: data.error ?? "Send failed." });
        return;
      }
      setStatus({ kind: "ok", message: `Sent to ${to}.` });
    } catch {
      setStatus({ kind: "error", message: "Send failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popup
      button="Send test"
      buttonSize="small"
      caret
      horizontalAlign="right"
      size="small"
    >
      <div className="email-test-send-popover">
        <p>Sends this template with the sample variables.</p>
        <div className="email-test-send-row">
          <input
            onChange={(event) => setTo(event.target.value)}
            placeholder="you@example.com"
            type="email"
            value={to}
          />
          <Button
            buttonStyle="primary"
            disabled={busy || to.trim().length === 0}
            onClick={handleSend}
            size="small"
            type="button"
          >
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
        {status ? (
          <p className={`email-test-send-status ${status.kind}`}>
            {status.message}
          </p>
        ) : null}
      </div>
    </Popup>
  );
}

function StudioToolbar({
  onExport,
  status,
  theme,
  onThemeChange,
}: {
  onExport: (html: string) => void;
  status: string | null;
  theme: "basic" | "minimal";
  onThemeChange: (theme: "basic" | "minimal") => void;
}) {
  const { editor } = useCurrentEditor();
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    if (!editor || busy) {
      return;
    }
    setBusy(true);
    try {
      const { html } = await composeReactEmail({ editor });
      onExport(html);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="email-studio-toolbar">
      <div className="email-studio-toolbar-copy">
        <strong>Design canvas</strong>
        <span>
          Type <kbd>/</kbd> for blocks, or pick a <kbd>{"{{variable}}"}</kbd>{" "}
          from Variables.
        </span>
      </div>
      <div className="email-studio-toolbar-actions">
        <label className="email-studio-theme">
          Theme{" "}
          <select
            onChange={(event) =>
              onThemeChange(
                event.target.value === "minimal" ? "minimal" : "basic"
              )
            }
            value={theme}
          >
            <option value="basic">Basic</option>
            <option value="minimal">Minimal</option>
          </select>
        </label>
        <Button
          buttonStyle="primary"
          disabled={!editor || busy}
          onClick={handleExport}
          size="small"
          type="button"
        >
          {busy ? "Exporting…" : "Save HTML to template"}
        </Button>
        <TestSendPopup />
      </div>
      {status ? <span className="email-studio-status">{status}</span> : null}
    </div>
  );
}

export function EmailStudio({
  initialHtml,
  onSave,
}: {
  initialHtml: string;
  onSave: (html: string) => void;
}) {
  const [theme, setTheme] = useState<"basic" | "minimal">("basic");
  const [status, setStatus] = useState<string | null>(null);
  // Latest document as JSON ref. Theme switches remount the editor
  // (key={theme}), so remount from live state instead of stale initial HTML.
  // A ref (not state) avoids re-rendering the provider on every keystroke.
  const docRef = useRef<Content>(
    initialHtml.trim().length > 0 ? initialHtml : "<p>Hi {{username}}</p>"
  );
  const imageExtension = useEditorImage({ uploadImage: uploadImageToMedia });
  const busyRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single export path: serializes the canvas and writes the form field
  // only when the HTML actually changed. Never rejects: background
  // exports are best-effort, the toolbar button surfaces real errors.
  const exportIfChanged = async (editor: Editor): Promise<boolean> => {
    if (busyRef.current) {
      return false;
    }
    busyRef.current = true;
    try {
      const { html } = await composeReactEmail({ editor });
      if (html === lastSavedRef.current) {
        return false;
      }
      lastSavedRef.current = html;
      onSave(html);
      return true;
    } catch {
      return false;
    } finally {
      busyRef.current = false;
    }
  };

  const extensions = useMemo(
    () => [StarterKit, EmailTheming.configure({ theme }), imageExtension],
    [theme, imageExtension]
  );

  const items = useMemo<SlashCommandItem[]>(
    () => [...defaultSlashCommands, imageSlashCommand, ...toVariableItems()],
    []
  );

  const handleSave = (html: string) => {
    lastSavedRef.current = html;
    onSave(html);
    setStatus(`Saved ${html.length.toLocaleString()} chars of HTML.`);
  };

  // Auto-export when the canvas loses focus, so typing then hitting Save
  // Draft can never silently drop canvas changes. Still form-local: the
  // database is only written on save. Writes only when the export differs,
  // so Inspector clicks don't churn the form.
  const handleBlur = async ({ editor }: { editor: Editor }) => {
    const wrote = await exportIfChanged(editor);
    if (wrote && lastSavedRef.current) {
      setStatus(
        `Auto-saved ${lastSavedRef.current.length.toLocaleString()} chars of HTML.`
      );
    }
  };

  // Debounced export after typing pauses, so collection autosave never
  // persists a stale canvas. Cleared on unmount.
  const schedulePauseExport = (editor: Editor) => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
    }
    pauseTimerRef.current = setTimeout(() => {
      exportIfChanged(editor).then((wrote) => {
        if (wrote && lastSavedRef.current) {
          setStatus(
            `Auto-saved ${lastSavedRef.current.length.toLocaleString()} chars of HTML.`
          );
        }
      });
      // Short window: catches pauses fast enough that even rapid
      // type-then-save flows export first (blur covers the rest).
    }, 750);
  };

  useEffect(
    () => () => {
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current);
      }
    },
    []
  );

  return (
    <div className="email-studio">
      <EditorProvider
        content={docRef.current}
        editorContainerProps={{ className: "email-studio-body" }}
        extensions={extensions}
        immediatelyRender={false}
        key={theme}
        onBlur={handleBlur}
        onUpdate={({ editor }) => {
          docRef.current = editor.getJSON();
          schedulePauseExport(editor);
        }}
        slotBefore={
          <StudioToolbar
            onExport={handleSave}
            onThemeChange={setTheme}
            status={status}
            theme={theme}
          />
        }
      >
        <BubbleMenu />
        <SlashCommand items={items} />
        <Inspector.Root>
          <Inspector.Breadcrumb />
          <Inspector.Document />
          <Inspector.Node />
          <Inspector.Text />
        </Inspector.Root>
      </EditorProvider>
    </div>
  );
}
