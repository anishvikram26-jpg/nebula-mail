import { google, gmail_v1 } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { getGoogleOAuthClient } from '@/lib/auth/google';
import { getCurrentUser } from '@/lib/auth/middleware';

/**
 * Ensures the Google Account tokens are valid, refreshing the access token via
 * the stored refresh token if expired or nearing expiration.
 */
export async function refreshAccessTokenIfNeeded(account: {
  id: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const BUFFER_SECONDS = 300; // 5 minutes buffer

  // If token is still valid with buffer, return current accessToken
  if (
    account.accessToken &&
    account.expiresAt &&
    account.expiresAt > now + BUFFER_SECONDS
  ) {
    return account.accessToken;
  }

  // If expired or missing, refresh token is mandatory
  if (!account.refreshToken) {
    throw new Error(
      'REAUTH_REQUIRED: Google refresh token is missing. Please sign out and sign in again to grant offline access.'
    );
  }

  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({ refresh_token: account.refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('FAILED_TO_REFRESH_TOKEN: Google did not return a new access token.');
  }

  const newExpiresAt = credentials.expiry_date
    ? Math.floor(credentials.expiry_date / 1000)
    : now + 3600;

  // Persist fresh tokens securely in Prisma
  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken: credentials.access_token,
      expiresAt: newExpiresAt,
      // If Google reissued a refresh token, update it as well
      refreshToken: credentials.refresh_token || account.refreshToken,
    },
  });

  return credentials.access_token;
}

/**
 * Creates an authenticated Gmail API client for a specific user ID by loading
 * their Google credentials from the database and refreshing if needed.
 */
export async function getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'google',
    },
  });

  if (!account) {
    throw new Error('NO_GOOGLE_ACCOUNT: No connected Google account found for this user.');
  }

  const validAccessToken = await refreshAccessTokenIfNeeded(account);

  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    access_token: validAccessToken,
    refresh_token: account.refreshToken || undefined,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Convenience helper to retrieve the authenticated Gmail client for the current request session.
 */
export async function getAuthenticatedGmailClient() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('UNAUTHORIZED: No active user session.');
  }

  const gmail = await getGmailClient(user.id);
  return { gmail, user };
}
