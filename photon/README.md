# Photon Integration for GreenTrip

This directory contains the Photon integration for the GreenTrip travel app, including iMessage functionality.

## Overview

Photon provides two main components:
1. **iMessage Kit** (`@photon-ai/imessage-kit`) - Type-safe iMessage SDK for macOS
2. **Rapid AI Dev** - AI development toolkit (if needed)

## Prerequisites

- **macOS only**: iMessage Kit requires macOS to access the Messages database
- **Node.js >= 18.0.0** or **Bun >= 1.0.0**
- **Database Driver**: 
  - **Bun**: Uses built-in `bun:sqlite` (no extra dependencies)
  - **Node.js**: Requires `better-sqlite3` (already installed)

## Installation

Dependencies are already installed in the root `package.json` and `photon/package.json`:

```bash
npm install
# or
bun install
```

## Files

- `imessage-service.mjs` - Main service wrapper for iMessage functionality
- `example-usage.mjs` - Examples showing how to use the service
- `smoke_tes.mjs` - Basic smoke test (original test file)

## Quick Start

### 1. Basic Usage

```javascript
import PhotonIMessageService from './imessage-service.mjs';

const service = new PhotonIMessageService({ debug: true });

// Send a message
await service.sendText('+1234567890', 'Hello from GreenTrip!');

// Send trip notification
await service.sendTripNotification('+1234567890', {
    destination: 'Paris, France',
    startDate: '2025-06-01',
    endDate: '2025-06-07',
    budget: 2000,
    numDays: 7
});

// Clean up
await service.close();
```

### 2. Watch for Messages

```javascript
await service.startWatching({
    onTravelMessage: async (message) => {
        console.log('Travel message:', message.text);
        // Process the message and reply
        await service.sendText(message.sender, 'Thanks for your message!');
    },
    
    onNewMessage: async (message) => {
        console.log('New message:', message.text);
    },
    
    onError: (error) => {
        console.error('Error:', error);
    }
});
```

### 3. Integration with Backend

The service can be integrated with your FastAPI backend to:
- Send trip notifications when itineraries are ready
- Receive travel planning requests via iMessage
- Auto-reply to common questions

## Use Cases

### Use Case 1: Trip Notifications
When a user's itinerary is generated, send them an iMessage notification:

```javascript
// In your backend service
const tripData = {
    destination: itinerary.destination,
    startDate: itinerary.start_date,
    endDate: itinerary.end_date,
    budget: itinerary.budget,
    numDays: itinerary.num_days,
    tripId: trip.id
};

await imessageService.sendTripNotification(user.phone_number, tripData);
```

### Use Case 2: Receive Travel Requests
Watch for messages and process travel planning requests:

```javascript
await service.startWatching({
    onTravelMessage: async (message) => {
        // Parse the message for trip details
        // Forward to your itinerary generation endpoint
        // Send back the itinerary via iMessage
    }
});
```

### Use Case 3: Share Trips with Friends
When a user shares a trip with a friend, send them an iMessage:

```javascript
await service.sendItinerary(friend.phone_number, itinerary);
```

## Backend Integration

To integrate with your FastAPI backend, you can:

1. **Create a background service** that runs the iMessage watcher
2. **Add API endpoints** to trigger iMessage sends
3. **Handle webhooks** from iMessage events

Example backend endpoint:

```python
# In backend/app.py
@app.post("/imessage/send-notification")
async def send_imessage_notification(request: IMessageNotificationRequest):
    # Use subprocess or HTTP client to call the Node.js service
    # Or integrate directly if using Python iMessage library
    pass
```

## Configuration

The service accepts the following configuration options:

```javascript
const service = new PhotonIMessageService({
    debug: true,                    // Enable debug logging
    maxConcurrent: 5,               // Max concurrent sends
    pollInterval: 3000,              // Message polling interval (ms)
    unreadOnly: false,               // Watch only unread messages
    excludeOwnMessages: true        // Exclude messages sent by you
});
```

## Security Notes

- This SDK reads from the local iMessage database (`~/Library/Messages/chat.db`)
- No data is sent to external servers (except your webhook if configured)
- Always validate user input when building bots
- Respect user privacy and Apple's terms of service

## Troubleshooting

### Permission Issues
If you get permission errors:
1. Grant Terminal/iTerm full disk access in System Preferences
2. Ensure you have read access to `~/Library/Messages/chat.db`

### Database Locked
If the database is locked:
- Close the Messages app temporarily
- Or use the SDK in read-only mode

### Messages Not Sending
- Verify the phone number/email format
- Check that iMessage is enabled on your Mac
- Ensure the recipient has iMessage enabled

## Next Steps

1. **Test the smoke test**: Run `node photon/smoke_tes.mjs`
2. **Review examples**: Check `photon/example-usage.mjs`
3. **Integrate with backend**: Add API endpoints for iMessage functionality
4. **Add to your workflow**: Use iMessage for trip notifications and planning

## Resources

- [iMessage Kit GitHub](https://github.com/photon-hq/imessage-kit)
- [Photon Website](https://photon.codes)
- [Documentation](https://github.com/photon-hq/imessage-kit#readme)

## License

This integration uses the iMessage Kit which is licensed under SSPL with restrictions. See the [license](https://github.com/photon-hq/imessage-kit/blob/main/LICENSE) for details.

