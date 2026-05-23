# Obsidian Starnote PDF Importer

An Obsidian plugin for Android that enables seamless integration with Starnote app for PDF editing and importing.

## Features

✨ **Open Starnote Directly** - Launch Starnote app directly from Obsidian

📄 **Import PDFs** - Import PDF files into your Obsidian vault as new copies

🔄 **Seamless Editing** - Send PDFs to Starnote for editing and get edited copies back

⚙️ **Customizable Settings** - Configure import folder, filename prefixes, and conflict handling

📱 **Android Optimized** - Built specifically for Obsidian Android app

## Installation

1. Download or clone this repository
2. Copy the `starnote-pdf-importer` folder to your Obsidian vault's `.obsidian/plugins/` directory
3. Enable the plugin in Obsidian Settings > Community plugins

## Development Setup

```bash
cd starnote-pdf-importer
npm install
npm run dev
```

For production build:
```bash
npm run build
```

## Usage

### Opening Starnote App

1. Access the command palette (Ctrl/Cmd + P)
2. Search for "Open Starnote App"
3. Click to launch Starnote

### Importing PDFs

**Option 1: Pick and Import**
1. Command palette > "Pick and Import PDF File"
2. Select a PDF from your device
3. The PDF will be imported as a new copy in your vault

**Option 2: Context Menu Import**
1. Right-click on any PDF file in the file explorer
2. Select "Send to Starnote for Editing"
3. Edit in Starnote and export back to Obsidian

### Configuring Settings

Access settings through Obsidian Settings > Starnote PDF Importer:

- **Default Import Folder**: Set where imported PDFs are saved
- **Filename Prefix**: Add custom prefix to imported filenames
- **Auto-open**: Automatically open imported PDFs
- **Conflict Behavior**: Handle duplicate filenames

## How It Works

### Android Intent Integration

The plugin registers Obsidian protocol handlers to receive files from other apps:

- `obsidian://starnote-import` - Opens file picker for PDF selection
- `obsidian://starnote-edit-complete` - Handles edited PDFs from Starnote

### File Import Process

1. User selects or receives a PDF file
2. Plugin creates a copy with timestamp and custom prefix
3. File is saved to the configured import folder
4. Optionally opens the newly imported file

### Starnote Integration

The plugin uses Android deep linking to communicate with Starnote:

- Opens Starnote app via `android-app://` URI scheme
- Supports sending PDFs for editing
- Handles exported PDFs through share intents

## Technical Details

### Compatibility

- **Obsidian Version**: 1.0.0+
- **Platform**: Android only (iOS support not implemented)
- **Mobile**: Specifically designed for Obsidian mobile app

### API Features Used

- `Platform.isAndroidApp` - Platform detection
- `vault.createBinary()` - Binary file creation
- `vault.readBinary()` - Reading PDF content
- `registerObsidianProtocolHandler()` - Intent handling
- File menu integration

### File Handling

The plugin handles PDF files as binary data using:
- `ArrayBuffer` for file reading
- `Uint8Array` for binary storage
- Proper MIME type handling

## Troubleshooting

### Plugin Not Loading
- Ensure the plugin folder is in `.obsidian/plugins/`
- Check Obsidian console for errors (Settings > About > Open console)
- Verify manifest.json is valid JSON

### Can't Open Starnote
- Verify Starnote is installed on your Android device
- Check that Starnote supports external app launching
- Try reinstalling Starnote

### Import Fails
- Ensure sufficient storage space
- Check file permissions
- Verify the PDF file is not corrupted

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - See LICENSE file for details

## Changelog

### Version 1.0.0
- Initial release
- Open Starnote app functionality
- PDF import with file picker
- Android intent handling
- Configurable settings
- Context menu integration

## Support

For issues or feature requests, please use the GitHub issues page.
