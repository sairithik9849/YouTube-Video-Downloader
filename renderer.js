// @ts-nocheck
// Using the secure API exposed by preload script
// No direct access to Node.js or Electron APIs in renderer

// DOM Elements - Authentication
const authSection = document.getElementById('authSection');
const loginPrompt = document.getElementById('loginPrompt');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const appSection = document.getElementById('appSection');

// DOM Elements - Main App
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const videoInfoSection = document.getElementById('videoInfoSection');
const videoInfoLoading = document.getElementById('videoInfoLoading');
const videoInfoCard = document.getElementById('videoInfoCard');
const videoThumbnail = document.getElementById('videoThumbnail');
const videoDurationBadge = document.getElementById('videoDurationBadge');
const videoTitle = document.getElementById('videoTitle');
const videoChannel = document.getElementById('videoChannel');
const videoViews = document.getElementById('videoViews');
const videoUploadDate = document.getElementById('videoUploadDate');
const qualitySection = document.getElementById('qualitySection');
const qualitySelect = document.getElementById('qualitySelect');
const downloadBtn = document.getElementById('downloadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressStage = document.getElementById('progressStage');
const status = document.getElementById('status');
const playSection = document.getElementById('playSection');
const playBtn = document.getElementById('playBtn');
const openFolderBtn = document.getElementById('openFolderBtn');

// Global variables
let currentVideoInfo = null;
let downloadedFilePath = null;
let currentProgress = 0;
let targetProgress = 0;
let progressAnimationId = null;

// Progress interpolation system
class ProgressInterpolator {
    constructor() {
        this.currentProgress = 0;
        this.targetProgress = 0;
        this.isAnimating = false;
        this.animationSpeed = 0.02; // Smooth animation speed
        this.lastUpdateTime = 0;
    }

    setTarget(target) {
        this.targetProgress = Math.max(0, Math.min(100, target));
        if (!this.isAnimating) {
            this.startAnimation();
        }
    }

    startAnimation() {
        this.isAnimating = true;
        this.lastUpdateTime = performance.now();
        this.animate();
    }

    animate() {
        const now = performance.now();
        const deltaTime = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        // Smooth interpolation with easing
        const difference = this.targetProgress - this.currentProgress;
        const speed = Math.max(0.5, Math.abs(difference) * 0.05); // Dynamic speed based on distance
        
        if (Math.abs(difference) > 0.1) {
            this.currentProgress += difference * speed * (deltaTime / 16.67); // Normalize to 60fps
            this.updateUI();
            requestAnimationFrame(() => this.animate());
        } else {
            this.currentProgress = this.targetProgress;
            this.updateUI();
            this.isAnimating = false;
        }
    }

    updateUI() {
        const roundedProgress = Math.round(this.currentProgress * 10) / 10;
        progressFill.style.width = `${roundedProgress}%`;
        progressText.textContent = `${Math.round(roundedProgress)}%`;
        
        // Update progress data attribute for text color switching
        if (roundedProgress >= 50) {
            progressFill.setAttribute('data-progress', '50');
        } else {
            progressFill.removeAttribute('data-progress');
        }
    }

    setInstant(progress) {
        this.currentProgress = progress;
        this.targetProgress = progress;
        this.updateUI();
    }

    reset() {
        this.currentProgress = 0;
        this.targetProgress = 0;
        this.isAnimating = false;
        this.updateUI();
    }
}

const progressInterpolator = new ProgressInterpolator();

// Authentication initialization
(async function initializeAuth() {
    try {
        console.log('Checking authentication status...');
        
        // First check if we have a stored user profile
        const profileResult = await window.electronAPI.getUserProfile();
        console.log('Profile check result:', profileResult);
        
        if (profileResult.success && profileResult.profile) {
            console.log('Found user profile, showing authenticated state...');
            // User has a profile, show as authenticated
            userAvatar.src = profileResult.profile.picture || '';
            userName.textContent = profileResult.profile.name || 'Unknown User';
            userEmail.textContent = profileResult.profile.email || '';
            
            userProfile.style.display = 'flex';
            loginPrompt.style.display = 'none';
            showAppSection();
        } else {
            console.log('No user profile found, checking auth tokens...');
            const isAuthenticated = await window.electronAPI.isAuthenticated();
            console.log('Is authenticated:', isAuthenticated);
            
            if (isAuthenticated) {
                console.log('User is authenticated, showing profile...');
                await showUserProfile();
            } else {
                console.log('User is not authenticated, showing login prompt...');
                showLoginPrompt();
            }
        }
    } catch (error) {
        console.error('Authentication initialization error:', error);
        showLoginPrompt();
    }
})();

// Authentication Event Listeners
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

// Main App Event Listeners
fetchBtn.addEventListener('click', handleFetchVideo);
downloadBtn.addEventListener('click', handleDownloadVideo);
playBtn.addEventListener('click', handlePlayVideo);
openFolderBtn.addEventListener('click', handleOpenFolder);

// Authentication Functions
async function handleLogin() {
    try {
        showStatus('Opening Google sign-in...', 'info');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        
        // Start the OAuth flow with local server
        const result = await window.electronAPI.startOAuthFlow();
        
        if (result.success) {
            showStatus('Successfully signed in!', 'success');
            
            // Get and display user profile
            const profileResult = await window.electronAPI.getUserProfile();
            if (profileResult.success && profileResult.profile) {
                userAvatar.src = profileResult.profile.picture || '';
                userName.textContent = profileResult.profile.name || 'Unknown User';
                userEmail.textContent = profileResult.profile.email || '';
            }
            
            // Switch to authenticated state
            showAuthenticatedState();
            
        } else {
            showStatus('Authentication failed: ' + result.error, 'error');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showStatus('Error during sign-in: ' + error.message, 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign in with Google';
    }
}

async function handleCodeSubmit() {
    const codeInput = document.getElementById('authCodeInput');
    const code = codeInput.value.trim();
    
    if (code) {
        showStatus('Exchanging code for tokens...', 'info');
        
        try {
            const result = await window.electronAPI.exchangeCodeForTokens(code);
            
            if (result.success) {
                showStatus('Successfully signed in!', 'success');
                
                // Get and display user profile
                const profileResult = await window.electronAPI.getUserProfile();
                if (profileResult.success && profileResult.profile) {
                    userAvatar.src = profileResult.profile.picture || '';
                    userName.textContent = profileResult.profile.name || 'Unknown User';
                    userEmail.textContent = profileResult.profile.email || '';
                }
                
                // Switch to authenticated state
                showAuthenticatedState();
                
            } else {
                showStatus('Authentication failed: ' + result.error, 'error');
            }
        } catch (error) {
            showStatus('Error during authentication: ' + error.message, 'error');
        }
    } else {
        showStatus('Please enter the authorization code', 'error');
    }
}

async function handleLogout() {
    try {
        await window.electronAPI.logout();
        showStatus('Signed out successfully', 'info');
        showLoginPrompt();
        hideVideoInfo();
    } catch (error) {
        console.error('Logout error:', error);
        showStatus('Error during sign-out: ' + error.message, 'error');
    }
}

async function showUserProfile() {
    try {
        const profileResult = await window.electronAPI.getUserProfile();
        console.log('showUserProfile - Profile result:', profileResult);
        
        if (profileResult.success && profileResult.profile) {
            // Update profile UI
            userAvatar.src = profileResult.profile.picture || '';
            userName.textContent = profileResult.profile.name || 'Unknown User';
            userEmail.textContent = profileResult.profile.email || '';
            
            // Hide all login-related UI elements
            loginPrompt.style.display = 'none';
            const codeSection = document.getElementById('codeInputSection');
            if (codeSection) {
                codeSection.style.display = 'none';
            }
            
            // Show authenticated state
            userProfile.style.display = 'flex';
            showAppSection();
            
            console.log('User profile displayed successfully');
        } else {
            console.log('No valid profile found');
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

function showLoginPrompt() {
    loginPrompt.style.display = 'block';
    userProfile.style.display = 'none';
    appSection.style.display = 'none';
}

function showAppSection() {
    appSection.style.display = 'block';
}

function showCodeInput() {
    // Create code input section if it doesn't exist
    let codeSection = document.getElementById('codeInputSection');
    if (!codeSection) {
        codeSection = document.createElement('div');
        codeSection.id = 'codeInputSection';
        codeSection.className = 'code-input-section';
        codeSection.innerHTML = `
            <div class="code-input-card">
                <h3>📋 Enter Authorization Code</h3>
                <p>Copy the authorization code from the Google sign-in page and paste it below:</p>
                <input type="text" id="authCodeInput" placeholder="Paste authorization code here..." class="code-input" />
                <div class="code-input-buttons">
                    <button id="submitCodeBtn" class="submit-code-btn">Submit Code</button>
                    <button id="cancelCodeBtn" class="cancel-code-btn">Cancel</button>
                </div>
            </div>
        `;
        
        // Insert after the auth section
        const authSection = document.getElementById('authSection');
        authSection.parentNode.insertBefore(codeSection, authSection.nextSibling);
        
        // Add event listeners
        document.getElementById('submitCodeBtn').addEventListener('click', handleCodeSubmit);
        document.getElementById('cancelCodeBtn').addEventListener('click', hideCodeInput);
        
        // Allow Enter key to submit
        document.getElementById('authCodeInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleCodeSubmit();
            }
        });
    }
    
    codeSection.style.display = 'block';
    loginPrompt.style.display = 'none';
    document.getElementById('authCodeInput').focus();
}

function hideCodeInput() {
    const codeSection = document.getElementById('codeInputSection');
    if (codeSection) {
        codeSection.style.display = 'none';
    }
    loginPrompt.style.display = 'block';
}

function showAuthenticatedState() {
    // Hide all login-related elements
    loginPrompt.style.display = 'none';
    const codeSection = document.getElementById('codeInputSection');
    if (codeSection) {
        codeSection.style.display = 'none';
    }
    
    // Show authenticated elements
    userProfile.style.display = 'flex';
    appSection.style.display = 'block';
    
    console.log('Switched to authenticated state');
}

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
        hideVideoInfo();
        return;
    }
    
    if (!isValidYouTubeUrl(url)) {
        showStatus('Please enter a valid YouTube URL', 'error');
        hideVideoInfo();
        return;
    }
    
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';
    showStatus('Getting video information...', 'info');
    
    // Show loading skeleton
    showVideoInfoLoading();
    
    try {
        console.log('Fetching video info for:', url);
        
        // Call secure API to get video info from main process
        const result = await window.electronAPI.getVideoInfo(url);
        
        if (result.error) {
            showStatus('Error: ' + result.error, 'error');
            hideVideoInfo();
            return;
        }
        
        if (!result.formats || result.formats.length === 0) {
            showStatus('No downloadable formats found for this video', 'error');
            hideVideoInfo();
            return;
        }
        
        // Display video info first
        if (result.videoInfo) {
            displayVideoInfo(result.videoInfo);
        }
        
        // Store video info and populate quality options
        currentVideoInfo = result;
        populateQualityOptions(result.formats);
        showStatus(`Found ${result.formats.length} available formats`, 'success');
        
    } catch (error) {
        console.error('Error fetching video info:', error);
        showStatus('Error fetching video info: ' + error.message, 'error');
        hideVideoInfo();
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
    
    // Show and initialize progress bar
    progressContainer.style.display = 'block';
    progressInterpolator.reset();
    progressFill.classList.add('downloading');
    updateProgressStage('Preparing download...', true);
    
    try {
        // Get selected option and its merging data
        const selectedOption = qualitySelect.options[qualitySelect.selectedIndex];
        const needsMerging = selectedOption.dataset.needsMerging === 'true';
        const audioItag = selectedOption.dataset.audioItag;
        
        // Call secure API to download video
        console.log('Downloading video with quality:', qualitySelect.value);
        console.log('Needs merging:', needsMerging);
        
        const url = urlInput.value.trim();
        const videoTitle = currentVideoInfo?.videoInfo?.title || 'video';
        
        const result = await window.electronAPI.downloadVideo(url, {
            videoItag: qualitySelect.value,
            needsMerging: needsMerging,
            audioItag: audioItag,
            videoTitle: videoTitle
        });
        
        if (result.cancelled) {
            showStatus('Download cancelled', 'info');
            hideProgressBar();
            return;
        }
        
        if (result.success) {
            downloadedFilePath = result.filePath;
            showStatus('Download completed successfully!', 'success');
            playSection.style.display = 'block';
        } else {
            showStatus('Download failed: ' + result.error, 'error');
        }
        
        hideProgressBar();
        
    } catch (error) {
        showStatus('Error downloading video: ' + error.message, 'error');
        hideProgressBar();
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Video';
    }
}

function hideProgressBar() {
    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressFill.classList.remove('downloading');
        progressInterpolator.reset();
    }, 1000);
}

function updateProgressStage(stage, isActive = false) {
    progressStage.textContent = stage;
    if (isActive) {
        progressStage.classList.add('active');
    } else {
        progressStage.classList.remove('active');
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

// Enhanced progress event handling with smooth interpolation
window.electronAPI.onDownloadProgress(({ percent, downloaded, total, stage, fileName, currentStep, totalSteps }) => {
    // Use smooth interpolation instead of instant updates
    progressInterpolator.setTarget(percent);
    
    if (stage && fileName) {
        // Show stage information for merging process
        updateProgressStage(stage, true);
        
        // Show clean, simplified status messages
        if (stage.includes('Downloading video stream')) {
            showStatus(`📥 Downloading video track...`, 'info');
        } else if (stage.includes('Downloading audio stream')) {
            showStatus(`🎵 Downloading audio track...`, 'info');
        } else if (stage.includes('Merging')) {
            showStatus(`🔗 Finalizing video...`, 'info');
        } else {
            showStatus(`⚙️ Processing...`, 'info');
        }
    } else if (downloaded && total && fileName) {
        // Show traditional download progress for simple downloads
        updateProgressStage(`Downloading... ${formatFileSize(downloaded)} / ${formatFileSize(total)}`, true);
        showStatus(`💾 Downloading video...`, 'info');
    } else if (fileName) {
        // Show basic progress
        updateProgressStage(`Processing... ${Math.round(percent)}%`, true);
        showStatus(`⚙️ Processing...`, 'info');
    } else {
        // Fallback for any cases without filename
        updateProgressStage(`Processing... ${Math.round(percent)}%`, true);
        showStatus(`⚙️ Processing...`, 'info');
    }
});

window.electronAPI.onDownloadComplete(({ success, filePath, error }) => {
    progressFill.classList.remove('downloading');
    
    if (success) {
        // Complete the progress bar smoothly
        progressInterpolator.setTarget(100);
        updateProgressStage('Download completed!', false);
        
        setTimeout(() => {
            downloadedFilePath = filePath;
            showStatus('Download completed successfully!', 'success');
            playSection.style.display = 'block';
            hideProgressBar();
        }, 500);
    } else {
        updateProgressStage('Download failed', false);
        showStatus('Download failed: ' + error, 'error');
        hideProgressBar();
    }
});

// Utility functions for video info display
function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

function formatViewCount(count) {
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'K';
    }
    return count.toLocaleString();
}

function formatUploadDate(dateString) {
    if (!dateString) return 'Unknown date';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 1) {
            return 'Today';
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months} month${months > 1 ? 's' : ''} ago`;
        } else {
            const years = Math.floor(diffDays / 365);
            return `${years} year${years > 1 ? 's' : ''} ago`;
        }
    } catch (error) {
        console.error('Error formatting upload date:', error);
        return 'Unknown date';
    }
}

function showVideoInfoLoading() {
    videoInfoSection.style.display = 'block';
    videoInfoLoading.style.display = 'block';
    videoInfoCard.style.display = 'none';
    qualitySection.style.display = 'none';
}

function hideVideoInfo() {
    videoInfoSection.style.display = 'none';
    qualitySection.style.display = 'none';
}

function displayVideoInfo(videoInfo) {
    // Hide loading, show card
    videoInfoLoading.style.display = 'none';
    videoInfoCard.style.display = 'block';
    
    // Set thumbnail (get highest quality available)
    if (videoInfo.thumbnails && videoInfo.thumbnails.length > 0) {
        const bestThumbnail = videoInfo.thumbnails.reduce((prev, current) => {
            return (current.width > prev.width) ? current : prev;
        });
        videoThumbnail.src = bestThumbnail.url;
        videoThumbnail.alt = videoInfo.title || 'Video thumbnail';
    }
    
    // Set duration badge
    if (videoInfo.lengthSeconds) {
        videoDurationBadge.textContent = formatDuration(videoInfo.lengthSeconds);
        videoDurationBadge.style.display = 'block';
    } else {
        videoDurationBadge.style.display = 'none';
    }
    
    // Set video details
    videoTitle.textContent = videoInfo.title || 'Unknown Title';
    videoChannel.textContent = videoInfo.author || 'Unknown Channel';
    
    // Set view count and upload date
    if (videoInfo.viewCount) {
        videoViews.textContent = `${formatViewCount(videoInfo.viewCount)} views`;
    } else {
        videoViews.textContent = 'View count unavailable';
    }
    
    if (videoInfo.uploadDate) {
        videoUploadDate.textContent = formatUploadDate(videoInfo.uploadDate);
    } else {
        videoUploadDate.textContent = 'Upload date unavailable';
    }
}

console.log('Renderer process loaded successfully');
console.log('electronAPI available:', !!window.electronAPI);
console.log('electronAPI object:', window.electronAPI); 