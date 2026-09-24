"use client";

import { useRef } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { sendAnnouncementAction } from "@/app/actions/admin";

const TEMPLATES = [
  { label: "App updated", title: "MV Markets updated ✨", body: "We've made MV Markets better. Open the app to see what's new.", url: "/" },
  { label: "New giveaway", title: "New giveaway 🎁", body: "A new giveaway just started — join now for a chance to win.", url: "/giveaways" },
  { label: "Get the app", title: "Get the MV Markets app", body: "Install the app for the fastest way to buy and sell.", url: "/app" },
];

export function AnnouncementForm() {
  const form = useRef<HTMLFormElement>(null);
  const fill = (t: (typeof TEMPLATES)[number]) => {
    const f = form.current;
    if (!f) return;
    (f.elements.namedItem("title") as HTMLInputElement).value = t.title;
    (f.elements.namedItem("body") as HTMLTextAreaElement).value = t.body;
    (f.elements.namedItem("url") as HTMLInputElement).value = t.url;
  };
  return (
    <div ref={(el) => { form.current = el?.querySelector("form") ?? null; }}>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="self-center text-xs text-slate-500">Quick fill:</span>
        {TEMPLATES.map((t) => (
          <button key={t.label} type="button" onClick={() => fill(t)} className="btn-secondary btn-sm">{t.label}</button>
        ))}
      </div>
      <ActionForm action={sendAnnouncementAction} className="space-y-3">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" name="title" required maxLength={80} className="input" placeholder="MV Markets updated ✨" />
        </div>
        <div>
          <label className="label" htmlFor="body">Message</label>
          <textarea id="body" name="body" required maxLength={240} rows={3} className="input" placeholder="What's new…" />
        </div>
        <div>
          <label className="label" htmlFor="url">Opens this page when tapped</label>
          <input id="url" name="url" defaultValue="/" className="input" placeholder="/ or /giveaways" />
        </div>
        <SubmitButton className="btn-primary" confirm="Send this notification to everyone now?" pendingText="Sending…">Send to everyone</SubmitButton>
      </ActionForm>
    </div>
  );
}
