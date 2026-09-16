import { WebhookConfig } from "@/components/dashboard/webhook-config";
import { CandidateImport } from "@/components/dashboard/candidate-import";

export default function OrgSettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Organization Settings</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">ATS Integrations</h2>
        <WebhookConfig />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Candidate Import</h2>
        <CandidateImport jobId="" />
      </section>
    </div>
  );
}
