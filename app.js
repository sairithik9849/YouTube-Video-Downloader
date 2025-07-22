import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ytdl from '@distube/ytdl-core';

// ES6 modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,        // 🔒 Disabled for security
      contextIsolation: true,        // 🔒 Enabled for security
      preload: path.join(__dirname, 'preload.js')  // 🔗 Secure bridge
    },
    icon: undefined // We can add an icon later
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// TODO: Add IPC handlers for:
// - get-video-info

// - download-video  
// - play-video

// IPC Handlers for YouTube Video Downloader
ipcMain.handle('get-video-info', async (event, url) => {
  try {
    // Validate URL
    if (!ytdl.validateURL(url)) {
      return { error: 'Invalid YouTube URL.' };
    }
    // Fetch video info
    const info = await ytdl.getInfo(url);
    // Filter for video+audio formats and remove duplicates
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    
    // Create a map to store unique quality options
    const qualityMap = new Map();
    
    formats.forEach(f => {
      const quality = f.qualityLabel || f.quality;
      const key = `${quality}-${f.container}`;
      
      // Only add if we don't have this quality yet, or if this one is better
      if (!qualityMap.has(key) || (f.contentLength && f.contentLength > (qualityMap.get(key).size || 0))) {
        qualityMap.set(key, {
          quality: quality,
          itag: f.itag,
          container: f.container,
          size: f.contentLength ? parseInt(f.contentLength) : null,
          hasVideo: f.hasVideo,
          hasAudio: f.hasAudio
        });
      }
    });
    
    // Convert map to array and sort by quality (descending)
    const result = Array.from(qualityMap.values())
      .filter(f => f.hasVideo && f.hasAudio) // Ensure both video and audio
      .sort((a, b) => {
        // Extract numeric quality for sorting
        const getQualityNum = (quality) => {
          const match = quality.match(/(\d+)p/);
          return match ? parseInt(match[1]) : 0;
        };
        return getQualityNum(b.quality) - getQualityNum(a.quality);
      });
    return { formats: result };
  } catch (err) {
    return { error: err.message || 'Failed to fetch video info.' };
  }
});

// Download video handler
ipcMain.handle('download-video', async (event, { url, itag }) => {
  
  try {
    // Show save dialog
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'video.mp4',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mkv', 'webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (!filePath) {
      return { cancelled: true };
    }

    return new Promise((resolve) => {
      const video = ytdl(url, { quality: itag });
      const writeStream = fs.createWriteStream(filePath);
      let downloaded = 0;
      let total = 0;

      video.on('progress', (chunkLength, downloadedSoFar, totalSize) => {
        downloaded = downloadedSoFar;
        total = totalSize;
        const percent = (downloaded / total) * 100;
        
        // Send progress update to renderer
        mainWindow.webContents.send('download-progress', {
          percent,
          downloaded,
          total
        });
      });

      video.pipe(writeStream);

      writeStream.on('finish', () => {
        mainWindow.webContents.send('download-complete', {
          success: true,
          filePath
        });
        resolve({ success: true, filePath });
      });

      video.on('error', (err) => {
        mainWindow.webContents.send('download-complete', {
          success: false,
          error: err.message
        });
        resolve({ success: false, error: err.message });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Play video handler
ipcMain.handle('play-video', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Open folder handler
ipcMain.handle('open-folder', async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}); 