import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// ES6 modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set ffmpeg path to use the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

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
    
    // Get video+audio formats (lower quality, ready to download)
    const videoAndAudioFormats = ytdl.filterFormats(info.formats, 'videoandaudio');
    
    // Get video-only formats (higher quality, needs merging)
    const videoOnlyFormats = ytdl.filterFormats(info.formats, 'videoonly');
    
    // Get best audio format for merging
    const audioOnlyFormats = ytdl.filterFormats(info.formats, 'audioonly');
    const bestAudio = audioOnlyFormats
      .filter(f => f.container === 'mp4' || f.container === 'webm')
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
    
    // Create a map to store unique quality options
    const qualityMap = new Map();
    
    // Add video+audio formats (no merging needed) - MP4 only
    videoAndAudioFormats.forEach(f => {
      if (f.container === 'mp4') {
        const quality = f.qualityLabel || f.quality;
        const key = `${quality}-${f.container}`;
        
        qualityMap.set(key, {
          quality: quality,
          itag: f.itag,
          container: f.container,
          size: f.contentLength ? parseInt(f.contentLength) : null,
          hasVideo: f.hasVideo,
          hasAudio: f.hasAudio,
          needsMerging: false,
          audioItag: null
        });
      }
    });
    
    // Add video-only formats (needs merging with audio) - MP4 only
    videoOnlyFormats.forEach(f => {
      if (f.container === 'mp4') {
        const quality = f.qualityLabel || f.quality;
        const key = `${quality}-${f.container}-videonly`;
        
        // Only add if we have a compatible audio format
        if (bestAudio) {
          qualityMap.set(key, {
            quality: quality,
            itag: f.itag,
            container: f.container,
            size: f.contentLength ? parseInt(f.contentLength) : null,
            hasVideo: f.hasVideo,
            hasAudio: false,
            needsMerging: true,
            audioItag: bestAudio.itag
          });
        }
      }
    });
    
    // Convert map to array and sort by quality (descending)
    const result = Array.from(qualityMap.values())
      .sort((a, b) => {
        // Extract numeric quality for sorting
        const getQualityNum = (quality) => {
          const match = quality.match(/(\d+)p/);
          return match ? parseInt(match[1]) : 0;
        };
        return getQualityNum(b.quality) - getQualityNum(a.quality);
      });
    
    return { 
      formats: result,
      audioFormat: bestAudio ? {
        itag: bestAudio.itag,
        container: bestAudio.container,
        bitrate: bestAudio.audioBitrate
      } : null
    };
  } catch (err) {
    return { error: err.message || 'Failed to fetch video info.' };
  }
});

// Download video handler with merging support
ipcMain.handle('download-video', async (event, { url, videoItag, needsMerging, audioItag }) => {
  
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

    if (!needsMerging) {
      // Simple download for video+audio formats (360p and below)
      return downloadSimple(url, videoItag, filePath);
    } else {
      // Download and merge for video-only formats (720p and above)
      return downloadAndMerge(url, videoItag, audioItag, filePath);
    }

  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Simple download function for video+audio formats
function downloadSimple(url, itag, filePath) {
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
}

// Download and merge function for video-only formats
async function downloadAndMerge(url, videoItag, audioItag, finalPath) {
  return new Promise(async (resolve, reject) => {
    // Create temporary file paths
    const tempDir = path.dirname(finalPath);
    const basename = path.basename(finalPath, path.extname(finalPath));
    const videoTemp = path.join(tempDir, `${basename}_video_temp.mp4`);
    const audioTemp = path.join(tempDir, `${basename}_audio_temp.mp4`);
    
    try {
      
      // Update UI
      mainWindow.webContents.send('download-progress', {
        percent: 0,
        downloaded: 0,
        total: 0,
        stage: 'Downloading video stream...'
      });

      // Download video stream
      await downloadStream(url, videoItag, videoTemp, 'video');
      
      // Update UI
      mainWindow.webContents.send('download-progress', {
        percent: 33,
        downloaded: 0,
        total: 0,
        stage: 'Downloading audio stream...'
      });

      // Download audio stream
      await downloadStream(url, audioItag, audioTemp, 'audio');
      
      // Update UI
      mainWindow.webContents.send('download-progress', {
        percent: 66,
        downloaded: 0,
        total: 0,
        stage: 'Merging video and audio...'
      });

      // Merge video and audio using ffmpeg
      await mergeStreams(videoTemp, audioTemp, finalPath);
      
      // Clean up temporary files
      try {
        if (fs.existsSync(videoTemp)) fs.unlinkSync(videoTemp);
        if (fs.existsSync(audioTemp)) fs.unlinkSync(audioTemp);
      } catch (cleanupErr) {
        console.warn('Warning: Could not clean up temp files:', cleanupErr.message);
      }

      // Notify completion
      mainWindow.webContents.send('download-complete', {
        success: true,
        filePath: finalPath
      });
      
      resolve({ success: true, filePath: finalPath });

    } catch (error) {
      // Clean up on error
      try {
        if (fs.existsSync(videoTemp)) fs.unlinkSync(videoTemp);
        if (fs.existsSync(audioTemp)) fs.unlinkSync(audioTemp);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }

      mainWindow.webContents.send('download-complete', {
        success: false,
        error: error.message
      });
      
      resolve({ success: false, error: error.message });
    }
  });
}

// Helper function to download a single stream
function downloadStream(url, itag, outputPath, streamType) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${streamType} stream (itag: ${itag}) to:`, outputPath);
    
    const stream = ytdl(url, { quality: itag });
    const writeStream = fs.createWriteStream(outputPath);
    
    stream.on('error', (err) => {
      console.error(`Error downloading ${streamType}:`, err.message);
      reject(err);
    });
    
    writeStream.on('error', (err) => {
      console.error(`Error writing ${streamType} file:`, err.message);
      reject(err);
    });
    
    writeStream.on('finish', () => {
      console.log(`${streamType} download completed:`, outputPath);
      const stats = fs.statSync(outputPath);
      console.log(`${streamType} file size:`, stats.size, 'bytes');
      resolve();
    });
    
    stream.pipe(writeStream);
  });
}

// Helper function to merge video and audio using ffmpeg
function mergeStreams(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('Merging streams:');
    console.log('  Video:', videoPath);
    console.log('  Audio:', audioPath);
    console.log('  Output:', outputPath);
    
    // Check if input files exist
    if (!fs.existsSync(videoPath)) {
      const error = new Error(`Video file not found: ${videoPath}`);
      console.error(error.message);
      return reject(error);
    }
    
    if (!fs.existsSync(audioPath)) {
      const error = new Error(`Audio file not found: ${audioPath}`);
      console.error(error.message);
      return reject(error);
    }
    
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-c:v copy',        // Copy video codec (no re-encoding)
        '-c:a aac',         // Convert audio to AAC
        '-strict experimental',
        '-avoid_negative_ts make_zero'  // Handle timestamp issues
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('stderr', (stderrLine) => {
        console.log('FFmpeg stderr:', stderrLine);
      })
      .on('progress', (progress) => {
        console.log('FFmpeg progress:', progress);
        // FFmpeg progress updates
        mainWindow.webContents.send('download-progress', {
          percent: 66 + (progress.percent || 0) * 0.34, // Scale to 66-100%
          downloaded: 0,
          total: 0,
          stage: `Merging... ${Math.round(progress.percent || 0)}%`
        });
      })
      .on('end', () => {
        console.log('Merging completed successfully');
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        console.error('FFmpeg stdout:', stdout);
        console.error('FFmpeg stderr:', stderr);
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .save(outputPath);
  });
}

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