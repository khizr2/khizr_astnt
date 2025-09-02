/**
 * iMessage Platform Adapter
 * Handles iMessage-specific messaging operations
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { logger } = require('../../utils/logger');

class IMessageAdapter {
    constructor() {
        this.name = 'imessage';
        this.displayName = 'iMessage';
        this.connections = new Map();

        // iMessage uses AppleScript for automation on macOS
        this.isMacOS = process.platform === 'darwin';
    }

    /**
     * Connect to iMessage (macOS only)
     */
    async connect(credentials = {}) {
        try {
            if (!this.isMacOS) {
                throw new Error('iMessage is only available on macOS');
            }

            // Test iMessage accessibility
            const testResult = await this.testIMessageAccess();

            if (!testResult.success) {
                throw new Error('Cannot access iMessage. Make sure Messages app has accessibility permissions.');
            }

            const userId = credentials.appleId || 'local_user';
            const connectionId = `imessage_${userId}`;

            this.connections.set(connectionId, {
                userId,
                connectedAt: new Date(),
                capabilities: this.getCapabilities()
            });

            logger.info(`iMessage connection established for ${userId}`);

            return {
                success: true,
                userId,
                displayName: 'iMessage User',
                connectionId
            };

        } catch (error) {
            logger.error('iMessage connection failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Test iMessage accessibility
     */
    async testIMessageAccess() {
        try {
            const script = `
            tell application "Messages"
                return "iMessage accessible"
            end tell
            `;

            const result = await this.executeAppleScript(script);
            return { success: true };

        } catch (error) {
            logger.error('iMessage accessibility test failed:', error);
            return {
                success: false,
                error: 'Messages app not accessible. Please enable accessibility permissions.'
            };
        }
    }

    /**
     * Send a message via iMessage
     */
    async sendMessage(messageData) {
        try {
            if (!messageData.recipientIdentifier) {
                throw new Error('Recipient phone number or email is required');
            }

            const script = `
            tell application "Messages"
                set targetService to 1st service whose service type = iMessage
                set targetBuddy to buddy "${messageData.recipientIdentifier}" of targetService
                send "${this.escapeAppleScriptString(messageData.content)}" to targetBuddy
                return "Message sent"
            end tell
            `;

            const result = await this.executeAppleScript(script);

            // Generate a pseudo message ID since iMessage doesn't provide one
            const messageId = `imessage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            logger.info(`iMessage sent to ${messageData.recipientIdentifier}`);

            return {
                success: true,
                messageId,
                threadId: messageData.recipientIdentifier // Use recipient as thread ID
            };

        } catch (error) {
            logger.error('Failed to send iMessage:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Receive messages from iMessage
     */
    async receiveMessages(options = {}) {
        try {
            // iMessage doesn't have a direct API, so we need to poll the Messages app
            const script = `
            tell application "Messages"
                set messageList to {}
                set chatList to every chat

                repeat with aChat in chatList
                    set chatMessages to messages of aChat
                    repeat with aMessage in chatMessages
                        set messageData to {sender: sender of aMessage, body: body of aMessage, date: date string of aMessage}
                        set end of messageList to messageData
                    end repeat
                end repeat

                return messageList
            end tell
            `;

            const result = await this.executeAppleScript(script);
            const messages = this.parseAppleScriptMessages(result);

            return messages.slice(0, options.limit || 50);

        } catch (error) {
            logger.error('Failed to receive iMessages:', error);
            return [];
        }
    }

    /**
     * Parse AppleScript message results
     */
    parseAppleScriptMessages(scriptResult) {
        try {
            // Parse the AppleScript result format
            // This is a simplified parser - real implementation would need more robust parsing
            const messages = [];

            if (scriptResult && typeof scriptResult === 'string') {
                // Split by some delimiter and parse
                // This is placeholder logic - actual parsing would depend on AppleScript output format
                const lines = scriptResult.split('\n');

                for (const line of lines) {
                    if (line.includes('sender:') && line.includes('body:')) {
                        const senderMatch = line.match(/sender:([^,]+)/);
                        const bodyMatch = line.match(/body:([^,]+)/);

                        if (senderMatch && bodyMatch) {
                            messages.push({
                                externalId: `imessage_${Date.now()}_${Math.random()}`,
                                type: 'text',
                                senderName: senderMatch[1].trim(),
                                senderIdentifier: senderMatch[1].trim(),
                                content: bodyMatch[1].trim(),
                                receivedAt: new Date().toISOString(),
                                platform: 'imessage'
                            });
                        }
                    }
                }
            }

            return messages;

        } catch (error) {
            logger.error('Failed to parse AppleScript messages:', error);
            return [];
        }
    }

    /**
     * Execute AppleScript
     */
    async executeAppleScript(script) {
        return new Promise((resolve, reject) => {
            exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }

    /**
     * Escape string for AppleScript
     */
    escapeAppleScriptString(str) {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, '\\\'');
    }

    /**
     * Get iMessage contacts
     */
    async getContacts() {
        try {
            const script = `
            tell application "Messages"
                set contactList to {}
                set chatList to every chat

                repeat with aChat in chatList
                    set participant to participants of aChat
                    set end of contactList to participant
                end repeat

                return contactList
            end tell
            `;

            const result = await this.executeAppleScript(script);
            return this.parseContacts(result);

        } catch (error) {
            logger.error('Failed to get iMessage contacts:', error);
            return [];
        }
    }

    /**
     * Parse contacts from AppleScript result
     */
    parseContacts(scriptResult) {
        // Placeholder implementation
        return [];
    }

    /**
     * Disconnect from iMessage
     */
    async disconnect(connectionId) {
        if (this.connections.has(connectionId)) {
            this.connections.delete(connectionId);
            logger.info(`iMessage connection ${connectionId} disconnected`);
        }
    }

    /**
     * Get platform capabilities
     */
    getCapabilities() {
        return {
            send: this.isMacOS,
            receive: this.isMacOS,
            threads: true,
            attachments: false, // Limited support
            readReceipts: true,
            typingIndicators: false,
            messageHistory: true,
            requiresMacOS: true
        };
    }

    /**
     * Check if iMessage is available on this system
     */
    isAvailable() {
        return this.isMacOS;
    }
}

module.exports = IMessageAdapter;
