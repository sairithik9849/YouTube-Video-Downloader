// @ts-nocheck
// Using the secure API exposed by preload script
// No direct access to Node.js or Electron APIs in renderer

// DOM Elements
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const qualitySection = document.getElementById('qualitySection');
const qualitySelect = document.getElementById('qualitySelect');
const downloadBtn = document.getElementById('downloadBtn');
const progressBar = document.getElementById('progressBar');
const status = document.getElementById('status');
const playSection = document.getElementById('playSection');
const playBtn = document.getElementById('playBtn');
const openFolderBtn = document.getElementById('openFolderBtn');

// Global variables
let currentVideoInfo = null;
let downloadedFilePath = null;

// Event Listeners
fetchBtn.addEventListener('click', handleFetchVideo);
downloadBtn.addEventListener('click', handleDownloadVideo);
playBtn.addEventListener('click', handlePlayVideo);
openFolderBtn.addEventListener('click', handleOpenFolder);

// Allow Enter key to fetch video info
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleFetchVideo();
    }
});

async function handleFetchVideo() {
    const url = urlInput.value.trim();
    
    if (!url) {
        showStatus('Please enter a YouTube URL', 'error');
        return;
    }
    
    if (!isValidYouTubeUrl(url)) {
        showStatus('Please enter a valid YouTube URL', 'error');
        return;
    }
    
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';
    showStatus('Getting video information...', 'info');
    
    try {
        console.log('Fetching video info for:', url);
        
        // Call secure API to get video info from main process
        const result = await window.electronAPI.getVideoInfo(url);
        
        if (result.error) {
            showStatus('Error: ' + result.error, 'error');
            return;
        }
        
        if (!result.formats || result.formats.length === 0) {
            showStatus('No downloadable formats found for this video', 'error');
            return;
        }
        
        // Store video info and populate quality options
        currentVideoInfo = result;
        populateQualityOptions(result.formats);
        showStatus(`Found ${result.formats.length} available formats`, 'success');
        
    } catch (error) {
        console.error('Error fetching video info:', error);
        showStatus('Error fetching video info: ' + error.message, 'error');
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Get Video Info';
    }
}

async function handleDownloadVideo() {
    if (!qualitySelect.value) {
        showStatus('Please select a video quality', 'error');
        return;
    }
    
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    showStatus('Starting download...', 'info');
    progressBar.style.display = 'block';
    
    try {
        // Get selected option and its merging data
        const selectedOption = qualitySelect.options[qualitySelect.selectedIndex];
        const needsMerging = selectedOption.dataset.needsMerging === 'true';
        const audioItag = selectedOption.dataset.audioItag;
        
        // Call secure API to download video
        console.log('Downloading video with quality:', qualitySelect.value);
        console.log('Needs merging:', needsMerging);
        
        const url = urlInput.value.trim();
        const result = await window.electronAPI.downloadVideo(url, {
            videoItag: qualitySelect.value,
            needsMerging: needsMerging,
            audioItag: audioItag
        });
        
        if (result.cancelled) {
            showStatus('Download cancelled', 'info');
            progressBar.style.display = 'none';
            return;
        }
        
        if (result.success) {
            downloadedFilePath = result.filePath;
            showStatus('Download completed successfully!', 'success');
            playSection.style.display = 'block';
        } else {
            showStatus('Download failed: ' + result.error, 'error');
        }
        
        progressBar.style.display = 'none';
        
    } catch (error) {
        showStatus('Error downloading video: ' + error.message, 'error');
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Video';
    }
}

async function handlePlayVideo() {
    if (downloadedFilePath) {
        try {
            await window.electronAPI.playVideo(downloadedFilePath);
        } catch (error) {
            showStatus('Error playing video: ' + error.message, 'error');
        }
    }
}

async function handleOpenFolder() {
    if (downloadedFilePath) {
        try {
            await window.electronAPI.openFolder(downloadedFilePath);
        } catch (error) {
            showStatus('Error opening folder: ' + error.message, 'error');
        }
    }
}

function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status ${type}`;
}

function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
}

function populateQualityOptions(formats) {
    qualitySelect.innerHTML = '<option value="">Select video quality...</option>';
    
    formats.forEach(format => {
        const option = document.createElement('option');
        option.value = format.itag;
        
        // Create descriptive text with merging info
        let description = `${format.quality} (${format.container})`;
        
        // Only tag 1080p and above as "High Quality"
        const getQualityNum = (quality) => {
            const match = quality.match(/(\d+)p/);
            return match ? parseInt(match[1]) : 0;
        };
        
        if (format.needsMerging && getQualityNum(format.quality) >= 1080) {
            description += ' - High Quality ⭐';
        }
        
        if (format.size) {
            description += ` - ${formatFileSize(format.size)}`;
        } else {
            description += ' - Size unknown';
        }
        
        option.textContent = description;
        
        // Store additional data for download handler
        option.dataset.needsMerging = format.needsMerging;
        option.dataset.audioItag = format.audioItag || '';
        
        qualitySelect.appendChild(option);
    });
    
    qualitySection.style.display = 'block';
}

function formatFileSize(bytes) {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Set up secure event listeners for download progress
window.electronAPI.onDownloadProgress(({ percent, downloaded, total, stage }) => {
    progressBar.value = percent;
    
    if (stage) {
        // Show stage information for merging process
        showStatus(`${stage}`, 'info');
    } else if (downloaded && total) {
        // Show traditional download progress
        showStatus(`Downloading... ${Math.round(percent)}% (${formatFileSize(downloaded)} / ${formatFileSize(total)})`, 'info');
    } else {
        // Show basic progress
        showStatus(`Processing... ${Math.round(percent)}%`, 'info');
    }
});

window.electronAPI.onDownloadComplete(({ success, filePath, error }) => {
    progressBar.style.display = 'none';
    
    if (success) {
        downloadedFilePath = filePath;
        showStatus('Download completed successfully!', 'success');
        playSection.style.display = 'block';
    } else {
        showStatus('Download failed: ' + error, 'error');
    }
});

console.log('Renderer process loaded successfully');
console.log('electronAPI available:', !!window.electronAPI);
console.log('electronAPI object:', window.electronAPI); 