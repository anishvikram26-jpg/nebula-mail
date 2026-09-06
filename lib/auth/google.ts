import { google } from 'googleapis';
import { getServerEnv } from '@/lib/config/env';

/**
 * Supported OAuth 2.0 Scopes for Nebula Mail
 * - userinfo.email & userinfo.profile: Essential user identity
 * - gmail.modify: Complete email management (read, write, labels, trash, send, history)
 */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
] as const;

/**
 * Creates an instance of Google OAuth2 client with server credentials.
 */
export function getGoogleOAuthClient(redirectUri?: string) {
  const env = getServerEnv();

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri || env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generates the Google OAuth authorization URL with required scopes,
 * offline access (to obtain refresh_token), and cryptographic state.
 */
export function getGoogleAuthorizationUrl(state: string): string {
  const oauth2Client = getGoogleOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Ensures a refresh_token is returned
    scope: [...GMAIL_SCOPES],
    state,
    include_granted_scopes: true,
  });
}

/**
 * Exchanges the OAuth authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string, redirectUri?: string) {
  const oauth2Client = getGoogleOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Retrieves the Google user profile (sub, email, name, picture) using an authenticated client.
 */
export async function getGoogleUserProfile(accessToken: string) {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const response = await oauth2.userinfo.get();
  return response.data;
}

/**
 * Refreshes an expired access token using a stored refresh token.
 */
export async function refreshGoogleAccessToken(refreshToken: string) {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}
