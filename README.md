# 🎥 YouTube Video Downloader

A secure desktop application built with Electron.js that allows you to download YouTube videos in various qualities. Features Google OAuth authentication to bypass YouTube's bot detection.

## ✨ Features

- 🔐 **Secure Google OAuth Authentication** - No more "Sign in to confirm you're not a bot" errors
- 📹 **Multiple Quality Options** - Download videos in 144p to 4K quality
- 🎵 **Audio/Video Merging** - Automatic merging for high-quality downloads using FFmpeg
- 📊 **Real-time Progress Tracking** - Beautiful progress bars with smooth animations
- 🎮 **User-Friendly Interface** - Clean, modern UI with video previews
- 🔒 **Privacy Focused** - All processing happens locally on your machine

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Cloud Console account (free)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/YouTube-Video-Downloader.git
cd YouTube-Video-Downloader
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Google OAuth (Required)

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Create a new project** or select an existing one
3. **Enable YouTube Data API v3**:
   - Go to "APIs & Services" → "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. **Create OAuth 2.0 credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Choose "Desktop application"
   - Set authorized redirect URI to: `urn:ietf:wg:oauth:2.0:oob`

### 4. Configure Your Credentials

1. **Copy the example config file**:
   ```bash
   cp auth-config.example.js auth-config.js
   ```

2. **Edit `auth-config.js`** with your Google OAuth credentials:
   ```javascript
   export const GOOGLE_CONFIG = {
     clientId: 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com',
     clientSecret: 'YOUR_ACTUAL_CLIENT_SECRET',
     // ... rest stays the same
   };
   ```

### 5. Run the Application

```bash
npm start
```

## 📖 How to Use

1. **Sign in with Google** - Click the "Sign in with Google" button
2. **Authorize the app** - Complete the OAuth flow in your browser
3. **Paste YouTube URL** - Enter any YouTube video URL
4. **Choose quality** - Select your preferred video quality
5. **Download** - Click download and choose where to save the file
6. **Enjoy** - Play the video or open the containing folder

## 🔧 Technical Details

### Architecture

- **Frontend**: HTML, CSS, JavaScript (Renderer Process)
- **Backend**: Node.js with Electron (Main Process)
- **Authentication**: Google OAuth 2.0
- **Video Processing**: ytdl-core + FFmpeg
- **Storage**: Electron Store (encrypted local storage)

### Security Features

- ✅ Context isolation enabled
- ✅ Node integration disabled in renderer
- ✅ Secure IPC communication
- ✅ OAuth tokens stored encrypted locally
- ✅ No hardcoded credentials in source code

## 🛡️ Privacy & Security

- **All processing happens locally** - No data sent to third-party servers
- **OAuth tokens are encrypted** - Stored securely on your machine
- **No video content uploaded** - Downloads happen directly from YouTube
- **Open source** - Audit the code yourself

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## ⚠️ Important Security Note

**Never commit your `auth-config.js` file to version control!** This file contains your Google OAuth secrets and is automatically ignored by Git.

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [ytdl-core](https://github.com/distube/ytdl-core) for YouTube video downloading
- [Electron](https://www.electronjs.org/) for the desktop framework
- [FFmpeg](https://ffmpeg.org/) for video/audio processing

## 💡 Troubleshooting

### "Sign in to confirm you're not a bot" Error
- Make sure you've completed the Google OAuth setup
- Verify your credentials in `auth-config.js`
- Try signing out and signing in again

### Download Fails
- Check your internet connection
- Verify the YouTube URL is valid and the video is publicly accessible
- Some videos may be region-restricted

### FFmpeg Issues
- FFmpeg is included automatically - no manual installation needed
- If merging fails, try downloading a lower quality format

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Search existing GitHub issues
3. Create a new issue with detailed information
