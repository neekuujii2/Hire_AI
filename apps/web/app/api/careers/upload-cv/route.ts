import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { presignUpload } from "@/lib/r2";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

const RATE_LIMIT_WINDOW_MS = 3600_000; // 1 hour
const RATE_LIMIT_MAX = 10;

function checkMagicBytes(buffer: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "application/pdf":
      return buffer.subarray(0, 4).toString() === "%PDF";
    case "application/msword":
      return buffer.subarray(0, 4).toString("hex") === "d0cf11e0";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return buffer.subarray(0, 4).toString("hex") === "504b0304";
    default:
      return false;
  }
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

const ipRateLimit = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = ipRateLimit.get(ip) || [];
  const filtered = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (filtered.length >= RATE_LIMIT_MAX) return true;
  filtered.push(now);
  ipRateLimit.set(ip, filtered);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 },
    );
  }

  let supabase;
  try {
    const cookieStore = await cookies();
    supabase = createServerClient(
      serverEnv.supabaseUrl as string,
      serverEnv.supabaseAnonKey as string,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              for (const cookie of cookiesToSet) {
                cookieStore.set(cookie.name, cookie.value, cookie.options);
              }
            } catch {}
          },
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;
  const email = (formData.get("email") as string)?.toLowerCase().trim();

  if (!file || !email) {
    return NextResponse.json(
      { error: "File and email are required" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 5MB)" },
      { status: 400 },
    );
  }

  const mimeType = file.type;
  if (!ALLOWED_TYPES[mimeType]) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: PDF, DOC, DOCX" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!checkMagicBytes(buffer, mimeType)) {
    return NextResponse.json(
      { error: "File signature mismatch. The file may be corrupted." },
      { status: 400 },
    );
  }

  try {
    const emailHash = Buffer.from(email).toString("hex").slice(0, 16);
    const timestamp = Date.now();
    const ext = ALLOWED_TYPES[mimeType];
    const key = `candidates/${emailHash}/cv_${timestamp}${ext}`;

    const { uploadUrl, publicUrl } = await presignUpload(
      key,
      mimeType,
      file.size,
    );

    // Store the file bytes to R2 via the presigned URL
    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: new Uint8Array(buffer),
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(file.size),
      },
    });

    if (!putResponse.ok) {
      return NextResponse.json(
        { error: "Upload failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ cvUrl: publicUrl, key });
  } catch (err) {
    console.error("[careers/upload-cv]", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}