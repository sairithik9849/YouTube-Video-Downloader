import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { AuthService } from './auth-service.js';

// ES6 modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set ffmpeg path to use the static binary
ffmpeg.setFfmpegPath(ffmpegStatic);

let mainWindow;
let authService;

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
  authService = new AuthService();
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

// Authentication IPC handlers
ipcMain.handle('get-auth-url', () => {
  return authService.getAuthUrl();
});

ipcMain.handle('exchange-code-for-tokens', async (event, code) => {
  return await authService.exchangeCodeForTokens(code);
});

ipcMain.handle('get-user-profile', async () => {
  try {
    const profile = authService.getUserProfile();
    return { success: true, profile };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout', () => {
  authService.logout();
  return { success: true };
});

ipcMain.handle('is-authenticated', () => {
  return authService.isAuthenticated();
});

ipcMain.handle('test-youtube-access', async () => {
  return await authService.testYouTubeAccess();
});

// IPC Handlers for YouTube Video Downloader
ipcMain.handle('get-video-info', async (event, url) => {
  try {
    // Check if user is authenticated
    if (!authService.isAuthenticated()) {
      return { error: 'Please sign in with your Google account first.' };
    }

    // Validate URL
    if (!ytdl.validateURL(url)) {
      return { error: 'Invalid YouTube URL.' };
    }

    // Get authenticated cookies
    const cookies = await authService.getYouTubeCookies();
    
    // Fetch video info with authenticated cookies
    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          cookie: cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    });
    
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
    
    // Extract video metadata for preview
    const videoDetails = info.videoDetails;
    const videoInfo = {
      title: videoDetails.title,
      author: videoDetails.author.name,
      channelUrl: videoDetails.author.channel_url,
      lengthSeconds: parseInt(videoDetails.lengthSeconds),
      viewCount: parseInt(videoDetails.viewCount),
      uploadDate: videoDetails.uploadDate,
      description: videoDetails.description,
      thumbnails: videoDetails.thumbnails || [],
      keywords: videoDetails.keywords || []
    };

    return { 
      formats: result,
      audioFormat: bestAudio ? {
        itag: bestAudio.itag,
        container: bestAudio.container,
        bitrate: bestAudio.audioBitrate
      } : null,
      videoInfo: videoInfo
    };
  } catch (err) {
    return { error: err.message || 'Failed to fetch video info.' };
  }
});

// Download video handler with merging support
ipcMain.handle('download-video', async (event, { url, videoItag, needsMerging, audioItag }) => {
  
  try {
    // Check if user is authenticated
    if (!authService.isAuthenticated()) {
      return { error: 'Please sign in with your Google account first.' };
    }
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
  return new Promise(async (resolve) => {
    // Get authenticated cookies
    const cookies = await authService.getYouTubeCookies();
    
    const video = ytdl(url, { 
      quality: itag,
      requestOptions: {
        headers: {
          cookie: cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    });
    const writeStream = fs.createWriteStream(filePath);
    const fileName = path.basename(filePath);
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
        total,
        fileName: fileName,
        currentStep: 1,
        totalSteps: 1
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
    const fileName = path.basename(finalPath);
    
    try {
      
      // Update UI
      mainWindow.webContents.send('download-progress', {
        percent: 0,
        downloaded: 0,
        total: 0,
        stage: 'Downloading video stream...',
        fileName: fileName,
        currentStep: 1,
        totalSteps: 3
      });

      // Download video stream (0% to 33%)
      await downloadStream(url, videoItag, videoTemp, 'video', 0, 33);
      
      // Download audio stream (33% to 66%)
      await downloadStream(url, audioItag, audioTemp, 'audio', 33, 33);
      
      // Merge video and audio using ffmpeg (continues smoothly from 66%)
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

// Helper function to download a single stream with progress tracking
function downloadStream(url, itag, outputPath, streamType, baseProgress = 0, progressRange = 33) {
  return new Promise(async (resolve, reject) => {
    console.log(`Downloading ${streamType} stream (itag: ${itag}) to:`, outputPath);
    
    // Get authenticated cookies
    const cookies = await authService.getYouTubeCookies();
    
    const stream = ytdl(url, { 
      quality: itag,
      requestOptions: {
        headers: {
          cookie: cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    });
    const writeStream = fs.createWriteStream(outputPath);
    const fileName = path.basename(outputPath);
    let downloaded = 0;
    let total = 0;
    
    // Track download progress for this stream
    stream.on('progress', (chunkLength, downloadedSoFar, totalSize) => {
      downloaded = downloadedSoFar;
      total = totalSize;
      
      // Calculate progress within this stage (0-33% for video, 33-66% for audio)
      const stageProgress = total > 0 ? (downloaded / total) * progressRange : 0;
      const totalProgress = baseProgress + stageProgress;
      
      // Send real-time progress update
      mainWindow.webContents.send('download-progress', {
        percent: Math.min(100, totalProgress),
        downloaded: downloadedSoFar,
        total: totalSize,
        stage: streamType === 'video' ? 'Downloading video stream...' : 'Downloading audio stream...',
        fileName: fileName.replace('_video_temp.mp4', '.mp4').replace('_audio_temp.mp4', '.mp4'),
        currentStep: streamType === 'video' ? 1 : 2,
        totalSteps: 3
      });
    });
    
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
    
    const fileName = path.basename(outputPath);
    let videoDuration = null;
    let lastProgressTime = Date.now();
    let fallbackProgress = 66;
    let lastReportedProgress = 66; // Track the last progress to ensure smooth continuation
    let mergeStarted = false; // Track if merging has actually started
    
    // Fallback progress updater in case FFmpeg doesn't report progress
    const fallbackInterval = setInterval(() => {
      if (fallbackProgress < 98 && !mergeStarted) {
        fallbackProgress += Math.random() * 1 + 0.5; // Slowly increment (0.5-1.5% per update)
        const safeProgress = Math.max(fallbackProgress, lastReportedProgress);
        
        // Ensure no sudden jumps in fallback mode either
        const maxIncrease = lastReportedProgress + 2; // Max 2% jump per fallback update
        const finalProgress = Math.min(safeProgress, maxIncrease, 98);
        lastReportedProgress = finalProgress;
        
        mainWindow.webContents.send('download-progress', {
          percent: finalProgress,
          downloaded: 0,
          total: 0,
          stage: 'Merging video and audio...',
          fileName: fileName,
          currentStep: 3,
          totalSteps: 3
        });
      }
    }, 500); // Update every 500ms
    
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
        
        // Extract duration from FFmpeg stderr for better progress calculation
        const durationMatch = stderrLine.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch && !videoDuration) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          videoDuration = hours * 3600 + minutes * 60 + seconds;
          console.log('Video duration detected:', videoDuration, 'seconds');
        }
      })
      .on('progress', (progress) => {
        console.log('FFmpeg progress:', progress);
        clearInterval(fallbackInterval); // Stop fallback since we have real progress
        
        if (!mergeStarted) {
          // First progress report - start from current position smoothly
          mergeStarted = true;
          lastProgressTime = Date.now();
        }
        
        let mergePercent = 0;
        
        // Try multiple methods to get accurate progress (with validation)
        if (progress.percent && progress.percent > 0 && progress.percent <= 100) {
          // Only use FFmpeg percent if it seems reasonable (not immediately 100%)
          if (progress.percent < 95 || (Date.now() - lastProgressTime) > 1000) {
            mergePercent = Math.min(100, progress.percent);
          }
        } else if (progress.timemark && videoDuration) {
          // Parse timemark (format: HH:MM:SS.SS)
          const timeMatch = progress.timemark.match(/(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseFloat(timeMatch[3]);
            const currentTime = hours * 3600 + minutes * 60 + seconds;
            mergePercent = Math.min(100, (currentTime / videoDuration) * 100);
          }
        }
        
        // If no reliable progress, use time-based estimation
        if (mergePercent === 0) {
          const timeDiff = (Date.now() - lastProgressTime) / 1000;
          mergePercent = Math.min(90, (timeDiff / 5) * 100); // Slower progression over 5 seconds
        }
        
        // Calculate total progress (66% + merge progress scaled to 34%)
        const calculatedProgress = 66 + (mergePercent * 0.34);
        
        // Ensure smooth progression - small incremental increases only
        const maxIncrease = lastReportedProgress + 5; // Max 5% jump per update
        const totalProgress = Math.min(calculatedProgress, maxIncrease, 100);
        lastReportedProgress = Math.max(totalProgress, lastReportedProgress); // Never go backwards
        
        console.log(`Merge progress: mergePercent=${mergePercent}%, calculated=${calculatedProgress}%, final=${lastReportedProgress}%`);
        
        mainWindow.webContents.send('download-progress', {
          percent: Math.min(100, totalProgress),
          downloaded: 0,
          total: 0,
          stage: 'Merging video and audio...',
          fileName: fileName,
          currentStep: 3,
          totalSteps: 3
        });
        
        lastProgressTime = Date.now();
      })
      .on('end', () => {
        console.log('Merging completed successfully');
        clearInterval(fallbackInterval);
        
        // Send final 100% progress
        lastReportedProgress = 100;
        mainWindow.webContents.send('download-progress', {
          percent: 100,
          downloaded: 0,
          total: 0,
          stage: 'Merging completed!',
          fileName: fileName,
          currentStep: 3,
          totalSteps: 3
        });
        
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        console.error('FFmpeg stdout:', stdout);
        console.error('FFmpeg stderr:', stderr);
        clearInterval(fallbackInterval);
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