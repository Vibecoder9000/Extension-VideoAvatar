# Video Avatars Extension for SillyTavern

Bring your characters to life with animated avatars!

![GIF](README/GIF.gif)

---

## Usage

1. Obtain and downscale a video to 240-480p.
2. Click the character avatar.
3. Upload the `.webm` or `.mp4` file.
4. Reload or click the toast. 

The extension will automatically:
   - Generate a PNG thumbnail for the character card
   - Save the PNG to `data/<user>/characters/`
   - Convert the video to animated WEBP
   - Save the animated WEBP to `data/<userName>/user/images/<character_name>/<filename>.webp` where `<character_name>` is the character's name and `<filename>` is the PNG filename.
   - Display the animated avatar when viewing the character

Video upload requires the [Video Background Loader extension](https://github.com/SillyTavern/Extension-VideoBackgroundLoader). Without it, you'll see a notification prompting you to install it.

---

### Installation

Requirement: SillyTavern `1.13.5`

1. Copy this page's URL: `https://github.com/Vibecoder9000/Extension-VideoAvatar`
2. Click on the `Extensions` tab:

![Step 2](README/Step2.png)

3. Click `Install extension`:

![Step 3](README/Step3.png)

4. Paste this page's URL and click `Install just for me`:

![Step 4](README/Step4.png)

---

## Supported Avatar Types:

 - Character Avatars

## Unsupported Avatar Types:

 - Persona Avatars

 - I'm not planning to add persona avatars because I don't personally need/want them. Contact me if you would like them.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/Vibecoder9000/Extension-VideoAvatar/issues)
- **Discussions:** [SillyTavern Discord](https://discord.gg/sillytavern)
- **DM:** URL `discord://-/users/643561434457833492` or Linkpharm

Created by Linkpharm & Various LLMs

### v1.0.0 (2025-10-12)
- Initial release
