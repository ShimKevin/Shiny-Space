let adminSocket;
const activeChats = new Map();
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Update WebSocket connection with proper protocol
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

// Function to initialize WebSocket connection
function initAdminChat() {
    adminSocket = new WebSocket(protocol + window.location.host);
    
    adminSocket.onopen = () => {
        console.log('WebSocket connection established');
        reconnectAttempts = 0;
        
        // Identify as admin with credentials
        adminSocket.send(JSON.stringify({
            type: 'identify',
            role: 'admin',
            username: 'admin',
            password: 'admin123'
        }));
    };
    
    adminSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Handle message count updates
            if (data.type === 'messageCount') {
                document.getElementById('newMessagesCount').textContent = data.count;
            }
            
            // Handle contact form notifications
            if (data.type === 'contact') {
                // Create notification
                const notification = document.createElement('div');
                notification.className = 'notification';
                notification.innerHTML = `
                    <div class="notification-header">New Contact Form</div>
                    <div class="notification-content">
                        <strong>${data.name}</strong> (${data.email})<br>
                        ${data.phone ? `Phone: ${data.phone}<br>` : ''}
                        ${data.message}
                    </div>
                `;
                
                document.getElementById('notifications').appendChild(notification);
                
                // Auto-remove notification after 10 seconds
                setTimeout(() => {
                    notification.style.opacity = '0';
                    setTimeout(() => notification.remove(), 300);
                }, 10000);
            }
            
            // Handle chat messages
            if (data.type === 'chat') {
                handleIncomingMessage(data);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    };
    
    adminSocket.onclose = (event) => {
        console.log('Admin WebSocket closed', event);
        showNotification('Connection Closed', 'Chat server connection lost');
        
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(3000 * (reconnectAttempts + 1), 30000);
            reconnectAttempts++;
            showNotification('Reconnecting', `Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts}) in ${delay/1000} seconds`);
            
            setTimeout(() => {
                console.log(`Reconnecting attempt ${reconnectAttempts}`);
                initAdminChat();
            }, delay);
        } else {
            showNotification('Connection Lost', 'Failed to reconnect. Please refresh the page.');
        }
    };
    
    adminSocket.onerror = (error) => {
        console.error('Admin WebSocket error:', error);
        showNotification('Connection Error', 'Failed to connect to chat server');
    };
}

function showNotification(title, content) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <div class="notification-header">${title}</div>
        <div class="notification-content">${content}</div>
    `;
    
    const notificationsContainer = document.getElementById('notifications');
    if (notificationsContainer) {
        notificationsContainer.appendChild(notification);
        
        // Auto-remove notification after 10 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 10000);
    }
}

function handleIncomingMessage(data) {
    const clientId = data.from;
    
    if (!activeChats.has(clientId)) {
        // New client - create chat entry
        activeChats.set(clientId, []);
        
        // Add to active chats list
        const chatList = document.getElementById('adminChatMessages');
        if (!chatList) return;
        
        // Remove "waiting" message if it exists
        const waitingMessage = chatList.querySelector('.message.system');
        if (waitingMessage) waitingMessage.remove();
        
        const chatItem = document.createElement('div');
        chatItem.classList.add('chat-item');
        chatItem.dataset.clientId = clientId;
        chatItem.innerHTML = `
            <div class="chat-header">
                <span class="client-id">Client: ${clientId}</span>
                <button class="close-chat"><i class="fas fa-times"></i></button>
            </div>
            <div class="chat-history"></div>
            <div class="chat-input-admin">
                <input type="text" placeholder="Type your reply...">
                <button class="send-admin"><i class="fas fa-paper-plane"></i></button>
            </div>
        `;
        
        // Add close button handler
        chatItem.querySelector('.close-chat').addEventListener('click', () => {
            chatItem.remove();
            activeChats.delete(clientId);
            // Update active chats count
            document.getElementById('activeChatsCount').textContent = activeChats.size;
            
            // Add waiting message back if no more chats
            if (activeChats.size === 0) {
                const chatList = document.getElementById('adminChatMessages');
                if (chatList) {
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('message', 'system');
                    messageElement.innerHTML = `
                        <div class="message-content">Waiting for incoming customer chats...</div>
                    `;
                    chatList.appendChild(messageElement);
                }
            }
        });
        
        // Add send button handler
        chatItem.querySelector('.send-admin').addEventListener('click', () => {
            sendAdminMessage(clientId, chatItem.querySelector('input').value);
        });
        
        // Add enter key handler
        chatItem.querySelector('input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendAdminMessage(clientId, e.target.value);
            }
        });
        
        chatList.appendChild(chatItem);
        
        // Update active chats count
        document.getElementById('activeChatsCount').textContent = activeChats.size;
    }
    
    // Add message to chat history
    const chatItem = document.querySelector(`.chat-item[data-client-id="${clientId}"]`);
    if (!chatItem) return;
    
    const chatHistory = chatItem.querySelector('.chat-history');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(data.from === 'admin' ? 'admin' : 'customer');
    
    // Use server timestamp if available
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
    
    messageElement.innerHTML = `
        <div class="message-sender">${data.from === 'admin' ? 'You' : 'Client'}</div>
        <div class="message-content">${data.message}</div>
        <div class="message-time">${timestamp.toLocaleTimeString()}</div>
    `;
    
    chatHistory.appendChild(messageElement);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    // Add to active chats storage
    activeChats.get(clientId).push(data);
}

function sendAdminMessage(clientId, message) {
    if (message.trim() === '') return;
    
    if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
        // Send message to server
        adminSocket.send(JSON.stringify({
            type: 'chat',
            role: 'admin',
            to: clientId,
            message: message
        }));
        
        // Add to chat UI
        const chatItem = document.querySelector(`.chat-item[data-client-id="${clientId}"]`);
        if (!chatItem) return;
        
        const input = chatItem.querySelector('input');
        input.value = '';
        
        const chatHistory = chatItem.querySelector('.chat-history');
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'admin');
        messageElement.innerHTML = `
            <div class="message-sender">You</div>
            <div class="message-content">${message}</div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        chatHistory.appendChild(messageElement);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        
        // Add to active chats storage
        activeChats.get(clientId).push({
            from: 'admin',
            message: message,
            timestamp: new Date().toISOString()
        });
    }
}

// Add logout functionality
document.querySelector('.admin-logout')?.addEventListener('click', () => {
    if (adminSocket) {
        adminSocket.close();
    }
    // Hide admin content and show login modal
    document.querySelector('.admin-main').style.display = 'none';
    document.querySelector('.admin-sidebar').style.display = 'none';
    document.getElementById('loginModal').style.display = 'flex';
});

// Initialize WebSocket connection when script loads
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the admin page
    if (document.querySelector('.admin-main')) {
        initAdminChat();
    }
});