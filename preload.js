const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded!');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication methods
  getAuthUrl: () => ipcRenderer.invoke('get-auth-url'),
  exchangeCodeForTokens: (code) => ipcRenderer.invoke('exchange-code-for-tokens', code),
  getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
  logout: () => ipcRenderer.invoke('logout'),
  isAuthenticated: () => ipcRenderer.invoke('is-authenticated'),
  testYouTubeAccess: () => ipcRenderer.invoke('test-youtube-access'),
  
  // YouTube video operations (now require authentication)
  getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
  downloadVideo: (url, downloadOptions) => ipcRenderer.invoke('download-video', { url, ...downloadOptions }),
  playVideo: (filePath) => ipcRenderer.invoke('play-video', filePath),
  openFolder: (filePath) => ipcRenderer.invoke('open-folder', filePath),
  
  // Event listeners for download progress
  onDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-progress', subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('download-progress', subscription);
    };
  },
  
  onDownloadComplete: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-complete', subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('download-complete', subscription);
    };
  },
  
  // Platform info
  platform: process.platform,
  
  // Version info
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
}); 