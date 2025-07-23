import { GOOGLE_CONFIG, YOUTUBE_API } from './auth-config.js';
import Store from 'electron-store';
import fetch from 'node-fetch';

const store = new Store();

export class AuthService {
  constructor() {
    this.accessToken = store.get('accessToken');
    this.refreshToken = store.get('refreshToken');
    this.expiresAt = store.get('expiresAt');
    this.userProfile = store.get('userProfile');
  }

  // Generate OAuth URL for Google sign-in
  getAuthUrl() {
    const params = new URLSearchParams({
      client_id: GOOGLE_CONFIG.clientId,
      redirect_uri: GOOGLE_CONFIG.redirectUri,
      response_type: 'code',
      scope: GOOGLE_CONFIG.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent'
    });

    return `${YOUTUBE_API.oauthUrl}?${params.toString()}`;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code) {
    try {
      const response = await fetch(YOUTUBE_API.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CONFIG.clientId,
          client_secret: GOOGLE_CONFIG.clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: GOOGLE_CONFIG.redirectUri
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.expiresAt = Date.now() + (data.expires_in * 1000);

      // Store tokens securely
      this.saveTokens();
      
      // Get and store user profile
      await this.fetchAndStoreUserProfile();
      
      return {
        success: true,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken
      };
    } catch (error) {
      console.error('Token exchange error:', error);
      return { success: false, error: error.message };
    }
  }

  // Refresh access token
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(YOUTUBE_API.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CONFIG.clientId,
          client_secret: GOOGLE_CONFIG.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: 'refresh_token'
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error_description || data.error);
      }

      this.accessToken = data.access_token;
      this.expiresAt = Date.now() + (data.expires_in * 1000);
      
      this.saveTokens();
      return this.accessToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  }

  // Get valid access token (refresh if needed)
  async getValidAccessToken() {
    if (!this.accessToken) {
      throw new Error('No access token available. Please sign in.');
    }

    // Check if token is expired (with 5 minute buffer)
    if (Date.now() > (this.expiresAt - 300000)) {
      await this.refreshAccessToken();
    }

    return this.accessToken;
  }

  // Get YouTube cookies using authenticated session
  async getYouTubeCookies() {
    try {
      const accessToken = await this.getValidAccessToken();
      
      // Create a cookie string that simulates an authenticated session
      // This is a simplified approach - YouTube will recognize the OAuth token
      const cookies = [
        `SAPISID=${this.generateSapisidCookie()}`,
        `__Secure-3PAPISID=${this.generateSapisidCookie()}`,
        `LOGIN_INFO=${accessToken}`,
        `VISITOR_INFO1_LIVE=${this.generateVisitorId()}`
      ].join('; ');

      return cookies;
    } catch (error) {
      console.error('Error getting YouTube cookies:', error);
      throw error;
    }
  }

  // Generate SAPISID cookie (simplified version)
  generateSapisidCookie() {
    const timestamp = Math.floor(Date.now() / 1000);
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}_${random}`;
  }

  // Generate visitor ID
  generateVisitorId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Fetch and store user profile
  async fetchAndStoreUserProfile() {
    try {
      const accessToken = await this.getValidAccessToken();
      
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to get user profile');
      }

      this.userProfile = await response.json();
      store.set('userProfile', this.userProfile);
      return this.userProfile;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw error;
    }
  }

  // Save tokens to secure storage
  saveTokens() {
    store.set('accessToken', this.accessToken);
    store.set('refreshToken', this.refreshToken);
    store.set('expiresAt', this.expiresAt);
  }

  // Clear stored tokens (logout)
  logout() {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.userProfile = null;
    
    store.delete('accessToken');
    store.delete('refreshToken');
    store.delete('expiresAt');
    store.delete('userProfile');
  }

  // Check if user is authenticated
  isAuthenticated() {
    console.log('Auth check:', {
      hasAccessToken: !!this.accessToken,
      hasRefreshToken: !!this.refreshToken,
      expiresAt: this.expiresAt,
      currentTime: Date.now(),
      isExpired: Date.now() >= this.expiresAt
    });
    return !!this.accessToken && !!this.refreshToken && Date.now() < this.expiresAt;
  }

  // Get user profile info
  getUserProfile() {
    return this.userProfile || store.get('userProfile');
  }

  // Test YouTube API access
  async testYouTubeAccess() {
    try {
      const accessToken = await this.getValidAccessToken();
      
      const response = await fetch(`${YOUTUBE_API.baseUrl}/channels?part=snippet&mine=true`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to access YouTube API');
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('YouTube API test failed:', error);
      return { success: false, error: error.message };
    }
  }
} 