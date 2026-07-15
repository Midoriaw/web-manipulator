<div align="center">

# 🧩 Web Manipulator

### Edit • Inspect • Analyze Websites Directly in Firefox

A powerful Firefox extension that allows you to inspect, modify and explore any website in real time.

---

![Firefox](https://img.shields.io/badge/Firefox-Supported-orange)
![Manifest](https://img.shields.io/badge/WebExtensions-MV2-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-yellow)
![Status](https://img.shields.io/badge/Status-Alpha-success)

</div>

---

# ✨ Features

## 🎨 Visual Editor

- Edit any text on a webpage
- Replace images
- Hide or remove elements
- Modify styles instantly
- Save selected elements

---

## 🌐 API Inspector

Automatically detects:

- Fetch requests
- XMLHttpRequests
- JSON APIs
- Request headers
- Response headers
- HTTP methods
- Response bodies (Firefox)

---

## 🎥 Media Detection

Find media files including:

- MP4
- WebM
- MP3
- M4A
- HLS (.m3u8)

Download supported media directly from the popup.

---

## 📂 Collections

Save useful page elements.

Store:

- images
- text
- selectors
- metadata

Remove or restore items anytime.

---

# 📸 Screenshots

> Coming soon

Popup

Visual Editor

API Inspector

Collections

---

# 🚀 Installation

## Temporary Installation

1. Open Firefox

```
about:debugging
```

2. Select

```
This Firefox
```

3. Click

```
Load Temporary Add-on
```

4. Select

```
manifest.json
```

---

# 🛣 Roadmap

### Version 0.1

- [x] Visual Editor
- [x] API Monitor
- [x] Media Detection
- [x] Collections

### Version 0.2

- [ ] Undo / Redo
- [ ] CSS Editor
- [ ] Attribute Editor
- [ ] HTML Editor

### Version 0.3

- [ ] Smart API Search
- [ ] Search Filters
- [ ] Export to Postman
- [ ] Export to JSON

### Version 1.0

- [ ] Chrome Support
- [ ] HLS Downloader
- [ ] Cloud Sync
- [ ] Plugin System

---

# 🔒 Permissions

The extension requires several Firefox permissions.

| Permission | Purpose |
|------------|---------|
| webRequest | Detect API requests |
| downloads | Download media |
| storage | Save collections |
| contextMenus | Visual editor |
| activeTab | Interact with current page |
| <all_urls> | Inspect websites |

---

# 📌 Current Status

The project is under active development.

New features are added continuously.

---

# 🤝 Contributing

Contributions, ideas and bug reports are welcome.

Feel free to open an Issue or Pull Request.

---

# 📄 License

MIT License


web-manipulator
│
├── assets
│   ├── banner.png
│   ├── popup.png
│   ├── api.png
│   ├── editor.png
│   └── demo.gif
│
├── docs
│   ├── architecture.md
│   ├── permissions.md
│   └── roadmap.md
│
├── README.md
├── CHANGELOG.md
├── LICENSE
└── CONTRIBUTING.md