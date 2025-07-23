// Google OAuth Configuration
export const GOOGLE_CONFIG = {
  // Replace these with your actual Google OAuth credentials
  // Get them from: https://console.cloud.google.com/apis/credentials
  clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
  redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
  scopes: [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ]
};

// YouTube API endpoints
export const YOUTUBE_API = {
  baseUrl: 'https://www.googleapis.com/youtube/v3',
  oauthUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token'
};

// App constants
export const APP_CONFIG = {
  name: 'YouTube Video Downloader',
  version: '1.0.0'
}; 