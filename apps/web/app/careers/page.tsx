import { getOrgBySlug, getPublishedJobs } from "@/lib/careers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default async function CareersPage({
  searchParams,
}: {
  searchParams: { org?: string };
}) {
  const orgSlug = searchParams.org;
  if (!orgSlug) notFound();

  const org = await getOrgBySlug(orgSlug);
  if (!org) notFound();

  const jobs = await getPublishedJobs(org.id);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center gap-4 mb-8">
        {org.logo_url && (
          <img src={org.logo_url} alt={org.name} className="w-12 h-12 rounded" />
        )}
        <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
      </div>
      <p className="text-xl text-gray-600 mb-12">Join our team.</p>

      {jobs.length === 0 ? (
        <p className="text-gray-500">No openings right now, check back soon.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/careers/jobs/${job.id}`}
              className="block p-6 border rounded-lg hover:border-gray-400 transition-colors"
            >
              <h2 className="font-semibold text-lg mb-2">{job.title}</h2>
              <div className="flex gap-2 text-sm text-gray-500">
                <span>{job.department}</span>
                <span>•</span>
                <span>{job.location_type}</span>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Posted {formatDistanceToNow(new Date(job.created_at))} ago
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
