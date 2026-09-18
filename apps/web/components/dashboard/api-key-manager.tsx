"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Key, Plus, Trash2, Copy, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  active: boolean;
}

export function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/org/api-keys");
      const data = await res.json();
      if (data.ok) setKeys(data.keys);
    } catch {
      // Error handled silently.
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/org/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setCreatedKey(data.key);
        setNewKeyName("");
        fetchKeys();
      }
    } catch {
      // Error handled silently.
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      await fetch(`/api/org/api-keys?id=${id}`, { method: "DELETE" });
      fetchKeys();
    } catch {
      // Error handled silently.
    }
  };

  const copyKey = () => {
    if (createdKey) navigator.clipboard.writeText(createdKey);
  };

  return (
    <div className="space-y-6">
      {/* Created Key Display */}
      {createdKey && (
        <Card className="border-ok/30 bg-ok/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-[14px] text-ok">API Key Created</CardTitle>
            <CardDescription className="text-[12px]">
              Copy this key now — it won't be shown again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-panel px-3 py-2 text-[12px] font-mono break-all">
                {showKey ? createdKey : "••••••••••••••••••••••••••••••••••••••••••••••••"}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={copyKey}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create New Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Key className="h-4 w-4" />
            API Keys
          </CardTitle>
          <CardDescription>
            Manage API keys for programmatic access to HireAI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Key name (e.g., production, staging)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createKey()}
            />
            <Button onClick={createKey} disabled={loading || !newKeyName.trim()}>
              <Plus className="h-3 w-3 mr-1" />
              Create
            </Button>
          </div>

          {/* Key List */}
          {keys.length === 0 && (
            <p className="text-center text-[13px] text-muted py-4">
              No API keys yet. Create one above.
            </p>
          )}

          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <Badge variant={k.active ? "default" : "outline"} className="text-[10px]">
                  {k.active ? "Active" : "Revoked"}
                </Badge>
                <div>
                  <p className="text-[13px] font-medium text-ink">{k.name}</p>
                  <p className="text-[11px] text-muted">
                    {k.key_prefix}••• · Created{" "}
                    {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at &&
                      ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              {k.active && (
                <Button variant="ghost" size="sm" onClick={() => revokeKey(k.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[14px]">API Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-ink/5 p-3">
            <p className="text-[12px] font-medium text-ink mb-1">Authentication</p>
            <code className="text-[11px] text-muted block">
              Authorization: Bearer hv_live_xxxxxxxxxxxx
            </code>
          </div>
          <div className="rounded-lg bg-ink/5 p-3">
            <p className="text-[12px] font-medium text-ink mb-1">Create Interview</p>
            <code className="text-[11px] text-muted block">
              POST /api/v1/interviews {"{"}job_id, candidate_email{"}"}
            </code>
          </div>
          <div className="rounded-lg bg-ink/5 p-3">
            <p className="text-[12px] font-medium text-ink mb-1">Get Report</p>
            <code className="text-[11px] text-muted block">
              GET /api/v1/interviews/:id/report
            </code>
          </div>
          <div className="rounded-lg bg-ink/5 p-3">
            <p className="text-[12px] font-medium text-ink mb-1">Import Candidates</p>
            <code className="text-[11px] text-muted block">
              POST /api/v1/candidates/import {"{"}job_id, candidates: [{"{"}name, email{"}"}]{"}"}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
