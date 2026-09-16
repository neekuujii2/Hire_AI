"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Webhook, Plus, Trash2, Send } from "lucide-react";

interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

const AVAILABLE_EVENTS = [
  { value: "candidate.shortlisted", label: "Candidate Shortlisted" },
  { value: "candidate.rejected", label: "Candidate Rejected" },
  { value: "interview.completed", label: "Interview Completed" },
];

export function WebhookConfig() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [testing, setTesting] = useState<string | null>(null);

  const addEndpoint = () => {
    if (!newUrl.trim()) return;
    setEndpoints([
      ...endpoints,
      {
        id: crypto.randomUUID(),
        url: newUrl.trim(),
        secret: "",
        events: ["candidate.shortlisted", "candidate.rejected"],
        active: true,
      },
    ]);
    setNewUrl("");
  };

  const removeEndpoint = (id: string) => {
    setEndpoints(endpoints.filter((e) => e.id !== id));
  };

  const toggleEndpoint = (id: string) => {
    setEndpoints(endpoints.map((e) => (e.id === id ? { ...e, active: !e.active } : e)));
  };

  const toggleEvent = (id: string, event: string) => {
    setEndpoints(
      endpoints.map((e) => {
        if (e.id !== id) return e;
        const events = e.events.includes(event)
          ? e.events.filter((ev) => ev !== event)
          : [...e.events, event];
        return { ...e, events };
      }),
    );
  };

  const testWebhook = async (endpoint: WebhookEndpoint) => {
    setTesting(endpoint.id);
    try {
      await fetch("/api/admin/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: endpoint.url, secret: endpoint.secret }),
      });
    } catch {
      // Error handled silently.
    } finally {
      setTesting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Webhook Configuration
        </CardTitle>
        <CardDescription>
          Receive real-time notifications when candidate statuses change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="https://your-ats.com/webhooks/hireai"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          <Button onClick={addEndpoint} disabled={!newUrl.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {endpoints.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No webhook endpoints configured. Add one above.
          </p>
        )}

        {endpoints.map((ep) => (
          <div key={ep.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={ep.active}
                  onCheckedChange={() => toggleEndpoint(ep.id)}
                />
                <code className="text-sm bg-muted px-2 py-1 rounded">{ep.url}</code>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => testWebhook(ep)}
                  disabled={testing === ep.id}
                >
                  <Send className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeEndpoint(ep.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {AVAILABLE_EVENTS.map((evt) => (
                <Badge
                  key={evt.value}
                  variant={ep.events.includes(evt.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleEvent(ep.id, evt.value)}
                >
                  {evt.label}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
