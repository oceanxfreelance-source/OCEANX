import { requireAdminPage } from "@/lib/auth/guards";
import { getSettings } from "@/lib/settings";
import { SETTINGS_FORMS } from "@/lib/settings-fields";
import { aiConfigured } from "@/lib/services/ai-screening";
import { env } from "@/lib/env";
import { PageTitle } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/SettingsForm";

export default async function AdminSettingsPage() {
  await requireAdminPage("settings");
  const settings = await getSettings();
  const groups = SETTINGS_FORMS.filter((f) => f.group !== "homepage");
  return (
    <>
      <PageTitle title="Marketplace settings" />
      <nav className="no-scrollbar flex gap-2 overflow-x-auto">
        {groups.map((g) => <a key={g.group} href={`#${g.group}`} className="btn-secondary btn-sm shrink-0">{g.title}</a>)}
      </nav>
      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        Integrations: AI slip reading {aiConfigured() ? "configured" : "not configured (ANTHROPIC_API_KEY)"} · Email {process.env.RESEND_API_KEY ? "configured" : "not configured (RESEND_API_KEY)"} · Storage: {env.storageDriver}
      </div>
      {groups.map((g) => <SettingsForm key={g.group} group={g.group} settings={settings} />)}
    </>
  );
}
