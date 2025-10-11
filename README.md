# Video Avatars Extension for SillyTavern

Bring your characters to life with animated avatars!

## Features

- **Video Upload Support** - Upload videos directly, automatically generates PNG thumbnails

### Installation

1. Copy this page's URL: `https://github.com/Vibecoder9000/Extension-VideoAvatar`
2. Click on the Extensions tab: ![Step 2](README/Step2.png)
3. Click Install extension: ![Step 3](README/Step3.png)
4. Paste this page's URL and click `Install just for me`.

## Usage

### Uploading Animated Avatars

1. Click the character avatar.
2. Select a `.webm` or `.mp4` file
3. The extension will automatically:
   - Generate a PNG thumbnail for the character card
   - Convert the video to animated WebP (requires Extension-VideoBackgroundLoader)
   - Save both the PNG and animated WebP to `data/<user>/characters/`
   - Display the animated avatar when viewing the character

**Note:** Video-to-WebP conversion requires the [Video Background Loader extension](https://github.com/SillyTavern/Extension-VideoBackgroundLoader). Without it, you'll see a notification prompting you to install it.

### How the Extension Finds Animated Files

The extension automatically checks for companion files with the same base name as the PNG avatar in the characters folder (e.g., `Alice.png` → looks for `Alice.webp`, `Alice.webm`, or `Alice.mp4`).

## Supported Avatar Types

- **Character Avatars** - `characters/<name>.png`
- **Group Avatars** - Works with group chat avatars too

## Unsupported Avatar Types

- **Persona Avatars** - `avatars/<name>.png`

Maybe in the future. Open an Issue or DM `Linkpharm` on Discord if you want this.

## Dependencies

### Optional (for video upload conversion)
- [Extension-VideoBackgroundLoader](https://github.com/SillyTavern/Extension-VideoBackgroundLoader) - Required for converting uploaded videos to animated WebP

The extension works without this dependency, but you won't be able to upload video files directly (you'll need to prepare animated WebP files separately).

- [ezgif.com](https://ezgif.com/video-to-webp)

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

## Support

- **Issues:** [GitHub Issues](https://github.com/Vibecoder9000/Extension-VideoAvatar/issues)
- **Discussions:** [SillyTavern Discord](https://discord.gg/sillytavern)

## Credits

Created by Linkpharm & Jippity

## Changelog

### v1.0.0 (2025-10-11)
- Initial release
