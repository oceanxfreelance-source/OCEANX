import type { Settings } from "@/lib/settings";
import { SETTINGS_FORMS, getPath } from "@/lib/settings-fields";
import { fileUrl } from "@/lib/storage";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { saveSettingsAction } from "@/app/actions/admin";

export function SettingsForm({ group, settings }: { group: keyof Settings; settings: Settings }) {
  const form = SETTINGS_FORMS.find((f) => f.group === group)!;
  const values = settings[group] as unknown as Record<string, unknown>;
  return (
    <section id={group} className="card scroll-mt-24 p-4">
      <h2 className="font-semibold">{form.title}</h2>
      <p className="mb-3 text-sm text-slate-600">{form.description}</p>
      <ActionForm action={saveSettingsAction}>
        <input type="hidden" name="group" value={group} />
        <div className="grid gap-3 sm:grid-cols-2">
          {form.fields.map((f) => {
            const v = getPath(values, f.key);
            const id = `${group}-${f.key}`;
            if (f.type === "bool")
              return (
                <label key={f.key} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:col-span-1">
                  <input type="checkbox" name={f.key} defaultChecked={!!v} className="mt-0.5 h-5 w-5 accent-ocean-700" />
                  <span>{f.label}{f.help && <span className="block text-xs text-slate-500">{f.help}</span>}</span>
                </label>
              );
            return (
              <div key={f.key} className={f.type === "textarea" || f.type === "list" ? "sm:col-span-2" : ""}>
                <label className="label" htmlFor={id}>{f.label}</label>
                {f.type === "select" ? (
                  <select id={id} name={f.key} defaultValue={String(v)} className="input">
                    {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea id={id} name={f.key} defaultValue={String(v ?? "")} rows={4} className="input" />
                ) : f.type === "list" ? (
                  <textarea id={id} name={f.key} defaultValue={Array.isArray(v) ? v.join("\n") : ""} rows={4} className="input" />
                ) : (
                  <input
                    id={id}
                    name={f.key}
                    type={f.type === "email" ? "email" : f.type === "text" ? "text" : "number"}
                    step={f.type === "money" ? "0.01" : f.type === "float" || f.type === "percent" ? "any" : "1"}
                    defaultValue={f.type === "money" ? Number(v) / 100 : String(v ?? "")}
                    className="input"
                  />
                )}
                {f.help && <p className="mt-1 text-xs text-slate-500">{f.help}</p>}
              </div>
            );
          })}
          {group === "general" && (
            <div className="sm:col-span-2">
              <label className="label">Logo</label>
              <div className="flex items-center gap-3">
                {settings.general.logoFileId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(settings.general.logoFileId)!} alt="" className="h-12 w-12 rounded-xl object-cover" />
                )}
                <input name="logo" type="file" accept="image/*" className="text-sm" aria-label="Logo" />
                {settings.general.logoFileId && <label className="text-xs"><input type="checkbox" name="removeLogo" /> remove</label>}
              </div>
            </div>
          )}
        </div>
        <SubmitButton>Save {form.title.toLowerCase()}</SubmitButton>
      </ActionForm>
    </section>
  );
}
