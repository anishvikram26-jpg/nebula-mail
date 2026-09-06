# Google Cloud Console OAuth 2.0 Setup Guide for Nebula Mail

This guide explains how to configure Google OAuth 2.0 credentials in the Google Cloud Console for the Nebula Mail application.

---

## 1. Create or Select a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown in the top bar and select **New Project**.
3. Name your project (e.g. `nebula-mail-app`) and click **Create**.

---

## 2. Enable Required Google APIs
1. In the navigation menu, go to **APIs & Services > Library**.
2. Search for **Gmail API** and click **Enable**.
3. Search for **Google People API** or **Google OAuth2 API** (enabled by default for profile/email).

---

## 3. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **User Type**:
   - For personal testing or hiring evaluation, select **External**.
3. Fill in the App Information:
   - **App name**: `Nebula Mail`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Click **Save and Continue**.
5. Under **Scopes**, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
6. Click **Save and Continue**.
7. Under **Test users**, click **+ Add Users** and add the Gmail address you plan to test with.
8. Click **Save and Continue**.

---

## 4. Create OAuth 2.0 Client Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. Choose **Application type**: **Web application**.
4. Set **Name**: `Nebula Mail Local Dev`.
5. Under **Authorized JavaScript origins**:
   - Add: `http://localhost:3000`
6. Under **Authorized redirect URIs**:
   - Add: `http://localhost:3000/api/auth/callback/google`
   *(Important: If running on a different port or host, match `NEXT_PUBLIC_APP_URL` + `/api/auth/callback/google`)*.
7. Click **Create**.
8. Copy your **Client ID** and **Client Secret**.

---

## 5. Configure Local Environment
Create or edit `.env.local` in the project root:

```env
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/callback/google"
SESSION_SECRET="generate-with-openssl-rand-base64-32"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## 6. Verify Authentication
1. Start the development server: `npm run dev`
2. Open `http://localhost:3000/login` in your browser.
3. Click **Continue with Google** and complete the consent flow.
