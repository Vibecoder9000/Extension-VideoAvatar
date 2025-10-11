# Video Avatars Extension

Bring your characters to life with animated avatars!

## Features

- 🎬 **Multiple Formats** - Supports animated WebP, WebM, and MP4 files
- 🔄 **Smart Fallback** - Uses static PNG if no animated version is found
- 📦 **Video Upload Support** - Upload videos directly, automatically generates PNG thumbnails
- 🎨 **Seamless Integration** - Maintains all styling and sizing from original avatars

## Installation

### Method 1: Install for All Users (Recommended for local development)

1. Clone or download this extension
2. Place the folder in `<SillyTavern>/public/scripts/extensions/third-party/VideoAvatar/`
3. Restart SillyTavern (or reload the page)
4. Go to **Extensions** → **Manage Extensions**
5. Enable **Video Avatars**

### Method 2: Install for Current User

1. Download this extension as a ZIP
2. In SillyTavern, go to **Extensions** → **Manage Extensions** → **Install Extension**
3. Upload the ZIP file
4. Enable **Video Avatars** from the extensions list

## Usage

### Uploading Animated Avatars

Upload video files directly through the SillyTavern UI:

1. Click the avatar upload button (character creation/edit)
2. Select a `.webm` or `.mp4` file
3. The extension will automatically:
   - Generate a PNG thumbnail for the character card
   - Convert the video to animated WebP (requires Extension-VideoBackgroundLoader)
   - Save both the PNG and animated WebP to `data/<user>/characters/`
   - Display the animated avatar when viewing the character

**Note:** Video-to-WebP conversion requires the [Video Background Loader extension](https://github.com/SillyTavern/Extension-VideoBackgroundLoader). Without it, you'll see a notification prompting you to install it.

### How the Extension Finds Animated Files

The extension automatically checks for companion files with the same base name as the PNG avatar in the characters folder (e.g., `Alice.png` → looks for `Alice.webp`, `Alice.webm`, or `Alice.mp4`).

### Supported Formats

The extension checks for companion files in this order:
1. `.webp` (animated WebP - best performance, created by video upload)
2. `.webm` (WebM video)
3. `.mp4` (MP4 video)

The first available format is used.

## Supported Avatar Types

- **Character Avatars** - `characters/<name>.png`
- **Persona Avatars** - `avatars/<name>.png`
- **Group Avatars** - Works with group chat avatars too

## Dependencies

### Optional (for video upload conversion)
- [Extension-VideoBackgroundLoader](https://github.com/SillyTavern/Extension-VideoBackgroundLoader) - Required for converting uploaded videos to animated WebP

The extension works without this dependency, but you won't be able to upload video files directly (you'll need to prepare animated WebP files separately).

## Configuration

Settings are stored automatically and persist across sessions.

### Default Settings

```javascript
{
  enabled: true,
  order: ['webp', 'webm', 'mp4'],  // Format check priority
  useHeadProbe: true                // Use HEAD requests (faster)
}
```

### Programmatic Access

```javascript
// Access extension API
window.STVideoAvatars.rescan();     // Manually trigger avatar scan
window.STVideoAvatars.settings;     // View current settings
```

## Troubleshooting

### Animated avatar not showing

1. **Check file naming** - The animated file must have the exact same base name as the PNG
   - ✅ `Alice.png` + `Alice.webp`
   - ❌ `Alice.png` + `alice.webp` (case matters on some systems)
   - ❌ `Alice.png` + `Alice_animated.webp`

2. **Check file location** - The animated file must be in the same directory as the PNG

3. **Check browser console** - Look for errors or warnings from `[Video Avatars]`

4. **Verify format support** - Make sure your browser supports the video format:
   - WebP: Supported in Chrome, Edge, Firefox, Opera
   - WebM: Widely supported
   - MP4: Widely supported

### Video upload not working

1. **Install Extension-VideoBackgroundLoader** - Required for video-to-WebP conversion
2. **Check file size** - Very large videos may timeout during conversion
3. **Check format** - Supported: `.webm`, `.mp4`, `.m4v`, `.mov`, `.ogg`

### Performance issues

1. **Use WebP format** - Animated WebP has the smallest file size
2. **Optimize videos** - Reduce resolution/bitrate for smaller files
3. **Disable HEAD probes** - Set `useHeadProbe: false` if your server doesn't support HEAD requests

## Creating Animated WebP Files

### Using FFmpeg (Recommended)

```bash
# Convert video to animated WebP
ffmpeg -i input.mp4 -vcodec libwebp -lossless 0 -q:v 80 -loop 0 -preset default -an output.webp

# With size optimization
ffmpeg -i input.mp4 -vf "scale=400:-1" -vcodec libwebp -lossless 0 -q:v 75 -loop 0 output.webp
```

### Using Online Tools

- [ezgif.com](https://ezgif.com/video-to-webp) - Free online converter
- [cloudconvert.com](https://cloudconvert.com/mp4-to-webp) - Another option

### Quality Guidelines

- **Resolution:** 400-800px width is usually sufficient
- **Frame Rate:** 15-24 FPS for smooth playback
- **Quality:** 70-80 for good balance of size/quality

## Technical Details

### How It Works

1. **MutationObserver** watches for new avatar images in the DOM
2. **URL Probing** checks for companion files via HEAD/GET requests
3. **Smart Replacement**:
   - WebP: Updates `<img src="...">`
   - Video: Replaces `<img>` with `<video autoplay loop muted>`
4. **Styling Preserved** - All classes, sizes, and border-radius maintained

### API Hooks

The extension provides hooks for integration:

```javascript
// Core can call this on newly created avatars
await window.resolveAndApplyAvatar(imgElement);

// Extension provides a public API
window.STVideoAvatars = {
  rescan: () => Promise<void>,
  settings: { enabled, order, useHeadProbe }
};
```

## Browser Compatibility

- ✅ Chrome/Edge 94+
- ✅ Firefox 90+
- ✅ Safari 16+
- ✅ Opera 80+

## Performance

- **Memory:** Minimal (in-memory URL cache only)
- **Network:** HEAD requests used by default (very lightweight)
- **CPU:** Low impact (async operations, fire-and-forget upgrades)
- **Disk:** No persistent cache

## Privacy & Security

- ✅ No external requests (all assets served from your SillyTavern instance)
- ✅ No telemetry or analytics
- ✅ No data collection
- ✅ All processing is client-side

## License

AGPLv3 - See [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Support

- **Issues:** [GitHub Issues](https://github.com/Vibecoder9000/SillyTavern-VideoAvatar/issues)
- **Discussions:** [SillyTavern Discord](https://discord.gg/sillytavern)

## Credits

Created by the Video Avatar Contributors

## Changelog

### v1.0.0 (2025-10-11)
- Initial release
- Automatic video/animated WebP detection
- Video upload support with conversion
- Multi-format support (WebP, WebM, MP4)
- Intelligent caching and performance optimization
