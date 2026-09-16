import { Eyebrow } from "@/components/ui/eyebrow";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-paper px-6 py-12">
      <header className="mb-12 text-center">
        <Eyebrow>HireAI</Eyebrow>
        <h1 className="mt-3 font-serif text-3xl text-ink">Welcome to HireAI</h1>
        <p className="mt-2 text-[14px] text-muted">
          Set up your organization to start interviewing candidates.
        </p>
      </header>
      <OnboardingForm />
    </main>
  );
}
