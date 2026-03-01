# ⚔️ WarWatch AI

### 🔴 LIVE SITE → [https://nareshkoundel.github.io/warwatch-ai/](https://nareshkoundel.github.io/warwatch-ai/)

---

## What is WarWatch AI?

**WarWatch AI** is a real-time war & conflict news intelligence dashboard powered by AI. It aggregates breaking news from 27+ global sources — RSS feeds, Reddit, and Telegram channels — and presents them in a cinematic, broadcast-style interface with deep analysis features.

Built for people who want to stay ahead of global conflicts without scrolling through noise.

---

## Features

- 🌍 **Live War News** — Real-time feed from 27+ sources (RSS, Reddit, Telegram)
- 🎙️ **AI Voice Agent** — Deep Indian broadcaster voice (4-tier: ElevenLabs → StreamElements → ResponsiveVoice Hindi Male → Web Speech)
- 🔴 **Threat Meter** — AI-scored global conflict threat level (0–100)
- 🗺️ **World Conflict Map** — Interactive map showing active war zones
- 📺 **Cinematic Video Mode** — Ken Burns effect background with auto-playing news
- 🔔 **Push Notifications** — Breaking news alerts
- 📊 **Statistics Dashboard** — Source trends, region breakdown, threat history
- 🌐 **Auto Translation** — News translated to your language
- 🔊 **Ambient Audio** — Immersive background soundscapes
- 📡 **Source Compare** — Side-by-side comparison of how different outlets cover the same story
- 🌙 **Reading Modes** — Night, Focus, and Compact modes
- ⌨️ **Keyboard Shortcuts** — Full keyboard navigation

---

## Regions Covered

| Region | Sources |
|--------|---------|
| 🇮🇱 Israel / Gaza | Al Jazeera, Times of Israel, Haaretz |
| 🇺🇦 Ukraine / Russia | Kyiv Independent, UA War Report, UAWeapons Reddit |
| 🇮🇷 Iran | IRNA, Iran International |
| 🇦🇫 Afghanistan | TOLO News, Afghanistan Reddit |
| 🇵🇰 Pakistan | Dawn, Geo News |
| 🕌 Middle East | Middle East Eye, Al Monitor |
| 🇺🇸 USA / NATO | Reuters, AP News, Defense Reddit |
| 🌍 Global | BBC World, The Guardian, r/worldnews |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (no frameworks) |
| News Fetching | RSS + Reddit JSON API + CORS proxies |
| Voice Engine | ElevenLabs API + StreamElements TTS + ResponsiveVoice + Web Speech API |
| Maps | Leaflet.js |
| Hosting | GitHub Pages |

---

## Voice Setup (Optional)

The app works **out of the box** with Hindi Male voice (auto).  
For premium deep Indian broadcaster voice (ElevenLabs):

1. Get a free API key at [elevenlabs.io](https://elevenlabs.io)
2. Click **🎙️ AI Voice** button in the app header
3. Paste your key → click **Activate**

---

## Run Locally

```bash
# Python 3
python -m http.server 8765
# Then open http://localhost:8765
```

---

## License

MIT — free to use and modify.

---

> Built with ❤️ by [@nareshkoundel](https://github.com/nareshkoundel)
