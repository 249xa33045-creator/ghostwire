# Ghostwire

Encrypted · Offline-first · Ephemeral P2P chat

No phone number. No email. No central server sees your messages.

---

## Stack

- **Client:** React Native (Expo)
- **Crypto:** ECDH P-256 + AES-256-GCM
- **Storage:** expo-secure-store (keys) + expo-sqlite (messages, encrypted)
- **Transport:** react-native-webrtc (P2P DataChannel)
- **Signaling:** WiFi LAN (offline) → Render WebSocket (fallback)
- **Notifications:** FCM via Expo
- **Server:** FastAPI on Render (signaling only, message-blind)

---

## Setup (Termux)

### Prerequisites

```bash
pkg install nodejs python
npm install -g eas-cli expo-cli
```

### Client

```bash
cd ghostwire
npm install
npx expo start --android
```

### Server (deploy to Render)

```bash
cd server
pip install -r requirements.txt

# Local test
uvicorn main:app --reload --port 8000

# Deploy: push to GitHub → connect Render
# Build command: pip install -r requirements.txt
# Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
# Env vars: FCM_SERVER_KEY=<your FCM key>
```

---

## Architecture Summary

```
REGISTRATION (once, internet):
  Generate ECDH keypair → SecureStore
  POST publicKey → Render /register
  Share deviceId with contacts

NEARBY (offline, WiFi/hotspot):
  UDP discovery on LAN
  WebRTC P2P direct
  No server contact

REMOTE (internet fallback):
  Render WebSocket relays SDP only
  WebRTC P2P after handshake
  Server never sees messages

MESSAGES:
  AES-256-GCM encrypted before storage
  SQLite on device
  Wipe = DELETE rows
  App kill = key gone → data unreadable

WIPE BUTTON:
  Deletes message rows from SQLite
  Keeps contact saved
  Keeps connection alive
```

---

## File Structure

```
ghostwire/
├── App.tsx                    # Root navigator
├── src/
│   ├── screens/
│   │   ├── SetupScreen.tsx    # First launch, create identity
│   │   ├── HomeScreen.tsx     # Contact list
│   │   ├── ChatScreen.tsx     # Messaging + wipe + disconnect
│   │   ├── QRScreens.tsx      # Show QR + scan QR + name prompt
│   │   └── SettingsScreen.tsx # Profile, contacts, security
│   ├── services/
│   │   ├── crypto.ts          # ECDH + AES-256-GCM
│   │   ├── identity.ts        # SecureStore keypair + contacts
│   │   ├── database.ts        # Encrypted SQLite messages
│   │   ├── webrtc.ts          # P2P DataChannel
│   │   └── signaling.ts       # LAN + Render WS signaling
│   ├── store/
│   │   └── index.ts           # Zustand global state
│   └── utils/
│       └── tokens.ts          # Design tokens
└── server/
    ├── main.py                # FastAPI signaling server
    └── requirements.txt
```

---

## Week-by-Week Build Plan

| Week | Focus |
|------|-------|
| 1 | Expo setup, crypto port, SecureStore, QR flow |
| 2 | WebRTC basic chat on same WiFi |
| 3 | Encrypted SQLite, message persistence, wipe |
| 4 | Render server, remote signaling, push notifications |
| 5 | Background service, foreground notification |
| 6 | Polish, APK build, two-device testing |

---

## Environment Variables

```
# server/.env
FCM_SERVER_KEY=your_fcm_key_here

# Render dashboard
FCM_SERVER_KEY=your_fcm_key_here
```

---

## APK Build

```bash
# Configure EAS
eas build:configure

# Build APK (free tier)
eas build --platform android --profile preview
```

`eas.json`:
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```
