/**
 * Friend Auto-Responder
 * 
 * Responds when your friend texts your number.
 * Bot responses come from your number.
 * 
 * Usage:
 *   node photon/auto-responder-friend.mjs
 *   FRIEND_NUMBER="+13012508042" node photon/auto-responder-friend.mjs
 */

import PhotonIMessageService from './imessage-service.mjs';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const PHOTON_ENDPOINT = `${BACKEND_URL}/photon/message`;

// Friend's number - who will be texting you
const FRIEND_NUMBER = process.env.FRIEND_NUMBER || '3012508042'; // Your friend: 301-250-8042
// Your number: 6109052638 (receiver and sender)
const RESPOND_TO_ALL = process.env.RESPOND_TO_ALL === 'true'; // Set to 'true' to respond to everyone

// Track processed messages
const processedMessages = new Set();
const MAX_PROCESSED = 1000;

function getMessageId(message) {
    return `${message.chatId}-${message.date?.getTime() || message.date}-${message.text?.substring(0, 20)}`;
}

function normalizePhoneNumber(number) {
    // Normalize phone numbers for comparison
    // Remove all non-digits and leading + or 1
    let normalized = number.replace(/\D/g, '');
    // Remove leading 1 if present (US country code)
    if (normalized.length === 11 && normalized.startsWith('1')) {
        normalized = normalized.substring(1);
    }
    return normalized;
}

function isFromFriend(message) {
    if (RESPOND_TO_ALL) {
        return true; // Respond to everyone
    }
    
    // Check if message is from the friend
    const messageNumber = normalizePhoneNumber(message.sender || '');
    const friendNumber = normalizePhoneNumber(FRIEND_NUMBER);
    
    // Compare normalized numbers
    const matches = messageNumber === friendNumber || 
                   messageNumber.endsWith(friendNumber) || 
                   friendNumber.endsWith(messageNumber) ||
                   messageNumber.includes(friendNumber) ||
                   friendNumber.includes(messageNumber);
    
    if (!matches) {
        console.log(`   Debug: messageNumber="${messageNumber}", friendNumber="${friendNumber}"`);
    }
    
    return matches;
}

console.log('🤖 Friend Auto-Responder');
console.log(`📡 Backend: ${BACKEND_URL}`);
console.log(`👤 Friend Number: ${FRIEND_NUMBER} (301-250-8042)`);
console.log(`📱 Your Number: 6109052638 (receiver & sender)`);
if (RESPOND_TO_ALL) {
    console.log(`🌍 Mode: Responding to ALL incoming messages`);
} else {
    console.log(`🎯 Mode: Only responding to friend (${FRIEND_NUMBER})`);
}
console.log('');
console.log('📱 Bot will respond when your friend texts YOUR number (6109052638)!');
console.log('   Responses will come from YOUR number (6109052638).\n');

const service = new PhotonIMessageService({
    debug: true,
    pollInterval: 1000,
    excludeOwnMessages: true, // Don't process messages sent from this Mac
    watcher: {
        pollInterval: 1000,
        unreadOnly: false,
        excludeOwnMessages: true // Important: exclude our own sent messages
    }
});

async function getAIResponse(messageText, sender) {
    try {
        const response = await fetch(PHOTON_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: messageText,
                user_id: sender
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        return data.text || 'Sorry, I couldn\'t process that request.';
    } catch (error) {
        console.error('❌ Error getting AI response:', error.message);
        return `Sorry, I encountered an error: ${error.message}`;
    }
}

console.log('📱 Starting friend bot watcher...\n');

await service.startWatching({
    onNewMessage: async (message) => {
        // Skip if it's from us (messages sent from this Mac)
        if (message.isFromMe) {
            console.log(`⏭️  Skipping own message (sent from this Mac)`);
            return;
        }
        
        // Check if it's from the friend (or respond to all if enabled)
        if (!isFromFriend(message)) {
            const normalizedSender = normalizePhoneNumber(message.sender || '');
            const normalizedFriend = normalizePhoneNumber(FRIEND_NUMBER);
            console.log(`⏭️  Skipping message from ${message.sender} (normalized: ${normalizedSender}, friend: ${normalizedFriend})`);
            return;
        }
        
        console.log(`✅ Message is from friend! (${message.sender})`);
        
        const messageId = getMessageId(message);
        
        // Skip if already processed
        if (processedMessages.has(messageId)) {
            return;
        }
        
        // Skip null/empty
        if (!message.text || message.text === 'null' || message.text.trim() === '') {
            return;
        }
        
        // Mark as processed
        processedMessages.add(messageId);
        if (processedMessages.size > MAX_PROCESSED) {
            const first = processedMessages.values().next().value;
            processedMessages.delete(first);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log(`📨 MESSAGE FROM FRIEND #${processedMessages.size}`);
        console.log('='.repeat(60));
        console.log(`From: ${message.sender}`);
        console.log(`Text: "${message.text}"`);
        console.log(`Date: ${message.date}`);
        console.log('='.repeat(60));
        
        console.log('\n🤖 Getting AI response...');
        const aiResponse = await getAIResponse(message.text, message.sender);
        
        console.log(`📤 Sending response from YOUR number...`);
        try {
            // Send response from your number (the Mac's iMessage account)
            await service.sendText(message.sender, aiResponse);
            console.log('✅ Response sent from your number!');
            console.log('🔄 Bot continues watching - ready for next message!');
        } catch (error) {
            console.error('❌ Error sending response:', error);
            processedMessages.delete(messageId);
        }
        
        console.log('='.repeat(60) + '\n');
    },
    
    onError: (error) => {
        console.error('❌ Watcher error:', error);
    }
});

console.log('✅ Friend bot is active!');
console.log(`   Your friend (${FRIEND_NUMBER}) can text YOUR number (6109052638) now.`);
console.log('   Bot will respond from YOUR number (6109052638)!\n');

// Health check
setInterval(() => {
    console.log(`\n💚 Bot Health: ${service.isWatching ? '✅ ACTIVE' : '❌ STOPPED'} | Processed: ${processedMessages.size} messages\n`);
}, 30000);

process.on('SIGINT', async () => {
    console.log(`\n\n📊 Bot Stats: ${processedMessages.size} messages from friend processed`);
    console.log('🛑 Shutting down bot...');
    await service.close();
    process.exit(0);
});

