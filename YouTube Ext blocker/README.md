# YouTube Display Blocker Chrome Extension

A Chrome extension that automatically blocks YouTube when an external display is connected, with password and biometric (Touch ID/Face ID) unlock capabilities.

## Features

- **Automatic Blocking**: Blocks YouTube automatically when an external display is detected
- **Focus Mode**: Manually enable blocking mode that works regardless of display connection - perfect for work or study sessions
- **Password Authentication**: Unlock with a password
- **Biometric Authentication**: Unlock with Touch ID, Face ID, or Windows Hello (WebAuthn)
- **Manual Controls**: Lock/unlock YouTube manually from the settings page
- **Configurable Duration**: Set how long YouTube stays unlocked after authentication

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `YouTube Ext blocker` folder
5. The extension is now installed!

## Setup

1. Click the extension icon in Chrome's toolbar
2. Go to the Settings page
3. Set a password for unlocking
4. (Optional) Set up biometric authentication (Touch ID/Face ID)
5. (Optional) Enable Focus Mode to block YouTube regardless of display connection
6. Configure unlock duration if desired

## How It Works

- The extension monitors your display configuration using Chrome's `system.display` API
- When an external display is connected (more than 1 display detected), YouTube is automatically blocked
- **Focus Mode**: Enable Focus Mode in settings to block YouTube regardless of display connection - great for staying focused during work or study
- You can unlock YouTube using your password or biometric authentication
- The unlock state expires after the configured duration (default: 1 hour)

## Icons

The extension requires icon files in the `icons/` directory:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can create these icons using any image editor, or use online tools to generate them. The icons should represent the extension (e.g., a blocked YouTube logo or a display with a lock).

## Permissions

The extension requires the following permissions:
- `system.display` - To detect when external displays are connected
- `storage` - To save settings and unlock state
- `tabs` - To manage YouTube tabs
- Host permissions for `youtube.com` - To block YouTube pages

## Development

### File Structure

```
YouTube Ext blocker/
├── manifest.json          # Extension manifest
├── background.js          # Service worker for display monitoring
├── content.js             # Content script for blocking YouTube
├── unlock.html            # Unlock page
├── unlock.js              # Unlock logic (WebAuthn + password)
├── options.html           # Settings page
├── options.js             # Settings page logic
├── styles/
│   ├── unlock.css        # Unlock page styles
│   └── options.css       # Settings page styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Security

- Passwords are hashed using SHA-256 before storage
- WebAuthn credentials are stored securely by the browser
- Unlock tokens expire automatically
- No sensitive data is stored in plain text

## Troubleshooting

- **Extension not blocking**: Make sure the extension is enabled in settings
- **Biometric auth not working**: Ensure your browser supports WebAuthn and you have a compatible device
- **Display not detected**: The extension detects displays when there are 2 or more displays connected

## License

This extension is provided as-is for personal use.
