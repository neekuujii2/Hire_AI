"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Upload, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "Retail",
  "Manufacturing",
  "Consulting",
  "Media",
  "Other",
] as const;

const TEAM_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1000+",
] as const;

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const canProceed = step === 1 ? companyName.trim().length > 0 : industry && teamSize;

  async function onSubmit() {
    if (!companyName.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: companyName.trim(),
          industry,
          team_size: teamSize,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to create organization.");
        setBusy(false);
        return;
      }

      router.push("/dashboard/jobs");
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={cn(
              "h-1.5 rounded-full transition-all",
              s === step
                ? "w-8 bg-accent"
                : s < step
                  ? "w-4 bg-accent/40"
                  : "w-4 bg-line",
            )}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
              <Building2 className="h-6 w-6 text-accent" />
            </div>
            <CardTitle className="mt-3 font-serif text-2xl">
              Tell us about your company
            </CardTitle>
            <CardDescription>
              This helps us personalize your interview experience.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="company-name">Company name</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                className="mt-1.5"
                autoFocus
              />
            </div>

            <div>
              <Label>Logo (optional)</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-line px-4 py-3 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent",
                  )}
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  {logoFile ? logoFile.name : "Upload logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>

            {error && (
              <p className="text-[13px] text-accent">{error}</p>
            )}

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceed}
              className={cn(buttonClasses(), "w-full")}
            >
              Continue
              <ArrowRight className="ml-1.5 inline h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-2xl">
              A bit more about you
            </CardTitle>
            <CardDescription>
              Help us tailor the platform to your team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Industry</Label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setIndustry(ind)}
                    className={cn(
                      "rounded-[8px] border px-3 py-2 text-[12px] font-medium transition-colors",
                      industry === ind
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-panel text-muted hover:border-faint hover:text-ink",
                    )}
                  >
                    {ind}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Team size</Label>
              <div className="mt-1.5 flex gap-2">
                {TEAM_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setTeamSize(size)}
                    className={cn(
                      "flex-1 rounded-[8px] border px-3 py-2 text-[12px] font-medium transition-colors",
                      teamSize === size
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-panel text-muted hover:border-faint hover:text-ink",
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-[13px] text-accent">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={cn(
                  buttonClasses({ variant: "out" }),
                  "flex-1",
                )}
              >
                Back
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canProceed || busy}
                className={cn(buttonClasses(), "flex-1")}
              >
                {busy ? "Creating…" : "Create Organization"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
