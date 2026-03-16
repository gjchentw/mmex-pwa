// Type declarations for Google Identity Services (GIS) Token Client
// Loaded via <script src="https://accounts.google.com/gsi/client">
// This is a global ambient declaration - no export so it augments the global scope directly.

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

export interface GoogleTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
  error_callback?: (error: { type: string }) => void
}

export interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string; hint?: string }) => void
}

export interface GoogleOAuth2 {
  initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
  revoke: (token: string, callback: () => void) => void
}

export interface GoogleAccounts {
  oauth2: GoogleOAuth2
}

export interface GoogleNamespace {
  accounts: GoogleAccounts
}

declare global {
  interface Window {
    google?: GoogleNamespace
  }
}
