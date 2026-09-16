"use client";

import { ClerkProvider as ClerkProviderBase } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/env";

/**
 * Clerk provider wrapper. When Clerk is not configured (dev/offline mode),
 * children are rendered directly — the app stays functional without auth.
 */
export function ClerkProvider({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured()) {
    return <>{children}</>;
  }

  return (
    <ClerkProviderBase
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      appearance={{
        elements: {
          // Match the HireAI design system tokens.
          card: "shadow-none border border-line rounded-[14px]",
          formButtonPrimary:
            "bg-accent hover:bg-accent/90 text-white rounded-[10px] text-[13px] font-medium",
          formFieldInput:
            "rounded-[10px] border-line text-ink text-[13px]",
          footerActionLink: "text-accent hover:text-accent/80",
        },
      }}
    >
      {children}
    </ClerkProviderBase>
  );
}
