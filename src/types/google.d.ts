// Type declarations for Google Identity Services (GIS) Token Client
// Loaded via <script src="https://accounts.google.com/gsi/client">
// This is a global ambient declaration - no export so it augments the global scope directly.

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

interface GoogleTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
  error_callback?: (error: { type: string }) => void
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string; hint?: string }) => void
}

interface GoogleOAuth2 {
  initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
  revoke: (token: string, callback: () => void) => void
}

interface GoogleAccounts {
  oauth2: GoogleOAuth2
}

interface GoogleNamespace {
  accounts: GoogleAccounts
}

// Extends the global Window interface with the optional `google` property
interface Window {
  google?: GoogleNamespace
}
