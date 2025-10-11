Not working yet. See https://github.com/SillyTavern/SillyTavern/pull/4646

# Video Avatars Extension for SillyTavern

Bring your characters to life with animated avatars!

![GIF](README/GIF.gif)

### Installation

1. Copy this page's URL: `https://github.com/Vibecoder9000/Extension-VideoAvatar`
2. Click on the `Extensions` tab:

![Step 2](README/Step2.png)

3. Click `Install extension`:

![Step 3](README/Step3.png)

4. Paste this page's URL and click `Install just for me`:

![Step 4](README/Step4.png)

## Usage

### Uploading Animated Avatars

1. Click the character avatar.
2. Select a `.webm` or `.mp4` file.
3. The extension will automatically:
   - Generate a PNG thumbnail for the character card
   - Convert the video to animated WebP (requires [Video Background Loader extension](https://github.com/SillyTavern/Extension-VideoBackgroundLoader))
   - Save the PNG to `data/<user>/characters/`
   - Save the animated WEBP to `data/<user>/user/images/<character_key>/<filename>.webp` where <character_key> is the character identifier and <filename>.webp is the PNG filename.
   - Display the animated avatar when viewing the character

**Note:** Video-to-WebP conversion requires the [Video Background Loader extension](https://github.com/SillyTavern/Extension-VideoBackgroundLoader). Without it, you'll see a notification prompting you to install it.

## Supported Avatar Types

- **Character Avatars**

## Unsupported Avatar Types

- **Persona Avatars**

Maybe in the future. Open an Issue or DM `Linkpharm` on Discord if you want this.

## Support

- **Issues:** [GitHub Issues](https://github.com/Vibecoder9000/Extension-VideoAvatar/issues)
- **Discussions:** [SillyTavern Discord](https://discord.gg/sillytavern)

## Credits

Created by Linkpharm & Jippity

### v1.0.0 (2025-10-11)
- Initial release
