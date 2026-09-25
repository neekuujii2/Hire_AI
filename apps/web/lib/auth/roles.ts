/**
 * Role-based access control for HireAI.
 *
 * Roles: candidate, recruiter, hr_manager, hiring_manager, admin
 *
 * The `users.role` column in Supabase mirrors this union. Server-side helpers
 * (`hasPermission`, `requirePermission`) read the role from the Clerk JWT /
 * Supabase user row and enforce it before any privileged action.
 */

export type Role = 'candidate' | 'recruiter' | 'hr_manager' | 'hiring_manager' | 'admin';

export type Permission =
  | 'jobs:create'
  | 'jobs:edit'
  | 'jobs:delete'
  | 'jobs:publish'
  | 'candidates:view'
  | 'candidates:export'
  | 'applications:move'
  | 'applications:bulk'
  | 'interviews:view'
  | 'interviews:create'
  | 'analytics:view'
  | 'analytics:export'
  | 'team:manage'
  | 'billing:manage'
  | 'settings:manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  candidate: [],
  recruiter: [
    'jobs:create',
    'jobs:edit',
    'candidates:view',
    'applications:move',
    'interviews:view',
  ],
  hr_manager: [
    'jobs:create',
    'jobs:edit',
    'jobs:delete',
    'jobs:publish',
    'candidates:view',
    'candidates:export',
    'applications:move',
    'applications:bulk',
    'interviews:view',
    'interviews:create',
    'analytics:view',
    'analytics:export',
    'settings:manage',
  ],
  hiring_manager: [
    'candidates:view',
    'applications:move',
    'interviews:view',
  ],
  admin: [
    'jobs:create',
    'jobs:edit',
    'jobs:delete',
    'jobs:publish',
    'candidates:view',
    'candidates:export',
    'applications:move',
    'applications:bulk',
    'interviews:view',
    'interviews:create',
    'analytics:view',
    'analytics:export',
    'team:manage',
    'billing:manage',
    'settings:manage',
  ],
};

export const ALL_PERMISSIONS: Permission[] = Array.from(
  new Set(Object.values(ROLE_PERMISSIONS).flat()),
);

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function requirePermission(
  role: Role,
  permission: Permission,
): asserts role is Role {
  if (!hasPermission(role, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

export const ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];
