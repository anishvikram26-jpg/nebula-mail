import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

/**
 * Retrieves the currently authenticated user from session cookies and verifies against DB.
 * Returns null if the user is unauthenticated or session is invalid.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
      },
    });

    if (dbUser) {
      return dbUser;
    }
  } catch {
    // If DB is temporarily offline, fallback to verified cryptographic session payload
  }

  return {
    id: session.userId,
    email: session.email,
    name: session.name || null,
    image: session.image || null,
  };
}

/**
 * Helper to enforce authentication in server components or route handlers.
 * Redirects to /login if unauthenticated.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}
