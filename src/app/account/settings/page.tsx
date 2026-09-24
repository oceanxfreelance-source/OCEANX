import { requireUser } from "@/lib/auth/guards";
import { getActiveLocations } from "@/lib/site";
import { smsConfigured } from "@/lib/messaging-providers";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { LocationPicker } from "@/components/Pickers";
import { updateProfileAction, changePasswordAction, requestPhoneCodeAction, verifyPhoneAction } from "@/app/actions/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/account/settings");
  const atolls = await getActiveLocations();
  const p = user.profile;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <ActionForm action={updateProfileAction} className="card p-4">
        <h2 className="font-semibold">Profile</h2>
        <Field label="Name" name="name"><input id="name" name="name" required defaultValue={user.name} className="input" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mobile number" name="phone" hint={user.phone ? (user.phoneVerifiedAt ? "Verified" : "Not verified") : undefined}>
            <input id="phone" name="phone" type="tel" defaultValue={user.phone?.replace("+960", "") ?? ""} className="input" />
          </Field>
          <Field label="WhatsApp / Viber" name="whatsapp"><input id="whatsapp" name="whatsapp" type="tel" defaultValue={p?.whatsapp?.replace("+960", "") ?? ""} className="input" /></Field>
        </div>
        <LocationPicker atolls={atolls.map((a) => ({ id: a.id, name: a.name, islands: a.islands.map((i) => ({ id: i.id, name: i.name, locations: [] })) }))} defaults={{ atollId: p?.atollId, islandId: p?.islandId }} withLocation={false} required={false} />
        <Field label="About you" name="bio"><textarea id="bio" name="bio" rows={3} maxLength={500} defaultValue={p?.bio ?? ""} className="input" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showPhone" defaultChecked={p?.showPhone ?? true} className="h-5 w-5 accent-ocean-700" /> Show my phone number on new listings by default</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyByEmail" defaultChecked={p?.notifyByEmail ?? true} className="h-5 w-5 accent-ocean-700" /> Email me important notifications</label>
        <SubmitButton>Save profile</SubmitButton>
      </ActionForm>

      {user.phone && !user.phoneVerifiedAt && smsConfigured() && (
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">Verify your phone</h2>
          <ActionForm action={requestPhoneCodeAction}><SubmitButton className="btn-secondary">Send code by SMS</SubmitButton></ActionForm>
          <ActionForm action={verifyPhoneAction}>
            <input name="code" inputMode="numeric" maxLength={6} className="input" placeholder="6-digit code" />
            <SubmitButton>Verify phone</SubmitButton>
          </ActionForm>
        </div>
      )}

      <ActionForm action={changePasswordAction} className="card p-4" resetOnSuccess>
        <h2 className="font-semibold">Change password</h2>
        <Field label="Current password" name="current"><input id="current" name="current" type="password" required autoComplete="current-password" className="input" /></Field>
        <Field label="New password" name="password"><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        <Field label="Confirm new password" name="confirm"><input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        <SubmitButton>Update password</SubmitButton>
      </ActionForm>
    </div>
  );
}
