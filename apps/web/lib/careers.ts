import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

function createAnonClient() {
  const cookieStore = cookies();
  return createServerClient(
    publicEnv.supabaseUrl as string,
    publicEnv.supabaseAnonKey as string,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const store = await cookieStore;
            for (const cookie of cookiesToSet) {
              store.set(cookie.name, cookie.value, cookie.options);
            }
          } catch {}
        },
      },
    }
  );
}

export async function getOrgBySlug(slug: string) {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*, org_configs(*)")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getPublishedJobs(orgId: string) {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_published", true)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return [];
  return data;
}

export async function getJobById(jobId: string) {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*, organizations(*)")
    .eq("id", jobId)
    .eq("is_published", true)
    .single();

  if (error || !data) return null;
  return data;
}
