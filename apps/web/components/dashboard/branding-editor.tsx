"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette, Save } from "lucide-react";

interface BrandingConfig {
  brand_color: string;
  welcome_message: string;
  thank_you_message: string;
}

export function BrandingEditor() {
  const [config, setConfig] = useState<BrandingConfig>({
    brand_color: "#4338ca",
    welcome_message: "",
    thank_you_message: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/org/branding");
      const data = await res.json();
      if (data.ok) setConfig(data.branding);
    } catch {
      // Error handled silently.
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/org/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
    } catch {
      // Error handled silently.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Palette className="h-4 w-4" />
          Interview Branding
        </CardTitle>
        <CardDescription>
          Customize the look and feel of your candidate-facing interview pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Brand Color */}
        <div>
          <label className="text-[12px] font-medium text-muted">Brand Color</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="color"
              value={config.brand_color}
              onChange={(e) => setConfig({ ...config, brand_color: e.target.value })}
              className="h-10 w-10 rounded border border-line cursor-pointer"
            />
            <Input
              value={config.brand_color}
              onChange={(e) => setConfig({ ...config, brand_color: e.target.value })}
              className="w-32"
              placeholder="#4338ca"
            />
          </div>
          <div
            className="mt-2 h-8 rounded"
            style={{ backgroundColor: config.brand_color }}
          />
        </div>

        {/* Welcome Message */}
        <div>
          <label className="text-[12px] font-medium text-muted">
            Custom Welcome Message (optional)
          </label>
          <Textarea
            value={config.welcome_message}
            onChange={(e) => setConfig({ ...config, welcome_message: e.target.value })}
            placeholder="Welcome to Acme's AI interview for the Senior Engineer role..."
            rows={3}
            className="mt-1"
          />
        </div>

        {/* Thank You Message */}
        <div>
          <label className="text-[12px] font-medium text-muted">
            Custom Thank You Message (optional)
          </label>
          <Textarea
            value={config.thank_you_message}
            onChange={(e) => setConfig({ ...config, thank_you_message: e.target.value })}
            placeholder="Thank you for completing your interview! We'll be in touch within 3 business days."
            rows={3}
            className="mt-1"
          />
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-line p-4">
          <p className="text-[11px] font-medium text-muted mb-2">Preview</p>
          <div className="rounded-lg p-4" style={{ backgroundColor: config.brand_color + "10" }}>
            <p className="text-[14px] font-medium text-ink">
              {config.welcome_message || "Welcome to your AI interview"}
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-3 w-3 mr-1" />
          {saving ? "Saving..." : "Save Branding"}
        </Button>
      </CardContent>
    </Card>
  );
}
