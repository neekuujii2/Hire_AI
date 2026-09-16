import { ApiKeyManager } from "@/components/dashboard/api-key-manager";

export default function ApiKeysPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="mt-1 text-[13px] text-muted">
          Manage API keys for programmatic access to HireAI.
        </p>
      </div>
      <ApiKeyManager />
    </div>
  );
}
