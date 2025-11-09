# Photon iMessage Integration Setup

This guide covers setting up the Photon iMessage integration for the travel app.

## Prerequisites

- **macOS only**: iMessage Kit requires macOS to access the Messages database
- **Node.js >= 18.0.0** or **Bun >= 1.0.0**
- **Full Disk Access**: Terminal/iTerm must have full disk access in System Preferences

## Installation

### Option 1: Install from Root (Recommended)

From the project root:

```bash
npm install
```

This will install dependencies for:
- Root package.json (includes Photon dependencies)
- `photon/package.json` (Photon-specific dependencies)
- `backend/package.json` (backend npm dependencies)
- `frontend/package.json` (frontend dependencies)

### Option 2: Install Photon Only

```bash
cd photon
npm install
```

### Option 3: Use npm Scripts

```bash
# Install all
npm run install

# Or install individually
npm run install:photon
```

## Required Dependencies

The Photon integration requires:

### Root `package.json`
- `@photon-ai/imessage-kit` - iMessage SDK
- `better-sqlite3` - SQLite driver (for Node.js)

### `photon/package.json`
- `@photon-ai/imessage-kit` - iMessage SDK
- `better-sqlite3` - SQLite driver (for Node.js)

**Note:** If using Bun, `better-sqlite3` is not needed as Bun has built-in SQLite support via `bun:sqlite`.

## Verification

After installation, verify the setup:

```bash
cd photon
node -e "import('@photon-ai/imessage-kit').then(() => console.log('✅ Photon installed successfully'))"
```

## Environment Variables

Add to your `.env` file (in `backend/`):

```env
PHOTON_API_KEY=your_photon_key  # Optional, if using Photon cloud features
IMESSAGE_APP_ID=your_app_id     # Optional, if using Photon cloud features
```

**Note:** For local iMessage access, these are typically not required. The SDK reads directly from your local Messages database.

## System Permissions

### Grant Full Disk Access

1. Open **System Preferences** → **Security & Privacy** → **Privacy** tab
2. Select **Full Disk Access** from the left sidebar
3. Click the lock icon and enter your password
4. Add **Terminal** (or **iTerm** if you use it) to the list
5. Restart Terminal/iTerm

### Verify Database Access

The SDK reads from: `~/Library/Messages/chat.db`

Test access:
```bash
ls ~/Library/Messages/chat.db
```

If you get a permission error, you need to grant Full Disk Access as above.

## Testing the Integration

### Test iMessage Service

```bash
cd photon
node imessage-service.mjs
```

### Test Auto-Responder

```bash
cd photon
node auto-responder-friend.mjs
```

## Troubleshooting

### Permission Denied

**Error:** `Error: EACCES: permission denied, open '~/Library/Messages/chat.db'`

**Solution:** Grant Full Disk Access to Terminal/iTerm in System Preferences.

### Database Locked

**Error:** `Error: database is locked`

**Solution:** 
- Close the Messages app temporarily
- Or use the SDK in read-only mode

### Module Not Found

**Error:** `Cannot find module '@photon-ai/imessage-kit'`

**Solution:**
```bash
cd photon
npm install
```

### Node Version

**Error:** `The engine "node" is incompatible with this module`

**Solution:** Upgrade to Node.js >= 18.0.0:
```bash
# Using nvm
nvm install 18
nvm use 18

# Or download from nodejs.org
```

## Project Structure

```
travel/
├── package.json              # Root package.json (includes Photon deps)
├── photon/
│   ├── package.json          # Photon-specific dependencies
│   ├── imessage-service.mjs  # Main iMessage service
│   └── auto-responder-friend.mjs  # Auto-responder script
└── backend/
    └── photon_integration/   # Python integration layer
```

## Using Bun Instead of Node.js

If you prefer Bun:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies (Bun uses built-in SQLite)
cd photon
bun install

# Run scripts
bun imessage-service.mjs
```

**Note:** With Bun, you don't need `better-sqlite3` as Bun has built-in SQLite support.

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Grant Full Disk Access to Terminal
3. ✅ Test the service: `cd photon && node imessage-service.mjs`
4. ✅ Start the backend: `cd backend && uvicorn app:app --reload`
5. ✅ Test the auto-responder: `cd photon && node auto-responder-friend.mjs`

## Resources

- [Photon iMessage Kit GitHub](https://github.com/photon-hq/imessage-kit)
- [Photon Website](https://photon.codes)
- [Documentation](https://github.com/photon-hq/imessage-kit#readme)

