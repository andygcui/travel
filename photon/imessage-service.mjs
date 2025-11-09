/**
 * Photon iMessage Service
 * 
 * A service wrapper for @photon-ai/imessage-kit to integrate iMessage
 * functionality into the GreenTrip travel app.
 * 
 * Features:
 * - Send trip notifications via iMessage
 * - Receive trip planning requests via iMessage
 * - Auto-reply to travel-related messages
 */

import { IMessageSDK } from '@photon-ai/imessage-kit';

class PhotonIMessageService {
    constructor(config = {}) {
        this.sdk = new IMessageSDK({
            debug: config.debug || false,
            maxConcurrent: config.maxConcurrent || 5,
            watcher: {
                pollInterval: config.pollInterval || 3000,
                unreadOnly: config.unreadOnly || false,
                excludeOwnMessages: config.excludeOwnMessages !== false, // Default true
            },
            ...config
        });
        
        this.isWatching = false;
        this.messageHandlers = [];
    }

    /**
     * Send a text message
     * 
     * Note: Messages sent programmatically may show "not delivered" in the Messages app
     * even though they were sent successfully. This is normal behavior because:
     * 1. Delivery confirmation happens asynchronously through Apple's servers
     * 2. The recipient may not have iMessage enabled (will fall back to SMS)
     * 3. Network delays can cause delayed delivery status updates
     * 
     * The message will still be delivered if the recipient has a valid phone/email.
     */
    async sendText(to, message) {
        try {
            await this.sdk.send(to, message);
            return { 
                success: true,
                note: "Message sent. Delivery status may take time to update in Messages app."
            };
        } catch (error) {
            console.error('Error sending iMessage:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send a trip notification
     */
    async sendTripNotification(to, tripData) {
        const message = this.formatTripNotification(tripData);
        return await this.sendText(to, message);
    }

    /**
     * Send itinerary details
     */
    async sendItinerary(to, itinerary) {
        const message = this.formatItinerary(itinerary);
        return await this.sendText(to, message);
    }

    /**
     * Format trip notification message
     */
    formatTripNotification(tripData) {
        const { destination, startDate, endDate, budget, numDays } = tripData;
        return `🌱 GreenTrip Notification

Your trip to ${destination} is ready!

📅 Dates: ${startDate} - ${endDate}
💰 Budget: $${budget}
📆 Duration: ${numDays} days

View your itinerary: https://greentrip.com/trips/${tripData.tripId || 'new'}

Happy travels! ✈️`;
    }

    /**
     * Format itinerary message
     */
    formatItinerary(itinerary) {
        let message = `🌱 Your GreenTrip Itinerary\n\n`;
        
        if (itinerary.destination) {
            message += `📍 ${itinerary.destination}\n`;
        }
        
        if (itinerary.days && Array.isArray(itinerary.days)) {
            itinerary.days.forEach((day, index) => {
                message += `\nDay ${index + 1}:\n`;
                if (day.morning) message += `🌅 Morning: ${day.morning.activity || day.morning}\n`;
                if (day.afternoon) message += `☀️ Afternoon: ${day.afternoon.activity || day.afternoon}\n`;
                if (day.evening) message += `🌙 Evening: ${day.evening.activity || day.evening}\n`;
            });
        }
        
        if (itinerary.total_cost) {
            message += `\n💰 Total Cost: $${itinerary.total_cost}`;
        }
        
        if (itinerary.total_emissions) {
            message += `\n🌍 Carbon Footprint: ${itinerary.total_emissions} kg CO₂`;
        }
        
        return message;
    }

    /**
     * Start watching for messages
     */
    async startWatching(handlers = {}) {
        if (this.isWatching) {
            console.warn('Already watching for messages');
            return;
        }

        await this.sdk.startWatching({
            onNewMessage: async (message) => {
                console.log('New iMessage received:', message);
                
                // Check if message is travel-related
                if (this.isTravelRelated(message.text || '')) {
                    if (handlers.onTravelMessage) {
                        await handlers.onTravelMessage(message);
                    }
                }
                
                if (handlers.onNewMessage) {
                    await handlers.onNewMessage(message);
                }
            },
            
            onGroupMessage: async (message) => {
                console.log('New group iMessage:', message);
                if (handlers.onGroupMessage) {
                    await handlers.onGroupMessage(message);
                }
            },
            
            onError: (error) => {
                console.error('iMessage watcher error:', error);
                if (handlers.onError) {
                    handlers.onError(error);
                }
            }
        });
        
        this.isWatching = true;
        console.log('Started watching for iMessages');
    }

    /**
     * Stop watching for messages
     */
    stopWatching() {
        if (!this.isWatching) {
            return;
        }
        
        this.sdk.stopWatching();
        this.isWatching = false;
        console.log('Stopped watching for iMessages');
    }

    /**
     * Check if message is travel-related
     */
    isTravelRelated(text) {
        if (!text) return false;
        
        const travelKeywords = [
            'trip', 'travel', 'vacation', 'itinerary', 'flight', 'hotel',
            'destination', 'budget', 'plan', 'greentrip', 'journey'
        ];
        
        const lowerText = text.toLowerCase();
        return travelKeywords.some(keyword => lowerText.includes(keyword));
    }

    /**
     * Get unread messages
     */
    async getUnreadMessages() {
        try {
            return await this.sdk.getUnreadMessages();
        } catch (error) {
            console.error('Error getting unread messages:', error);
            return [];
        }
    }

    /**
     * Close the SDK
     */
    async close() {
        if (this.isWatching) {
            this.stopWatching();
        }
        await this.sdk.close();
    }
}

export default PhotonIMessageService;

