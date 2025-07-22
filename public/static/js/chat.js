// Generate unique client ID
const clientId = 'client-' + Math.random().toString(36).substr(2, 9);
let chatSocket;
const chatModal = document.getElementById('chatModal');
let isChatOpen = false;

// Debugging: Log elements to console
console.log("Chat Modal Element:", chatModal);
console.log("Open Chat Button:", document.getElementById('openChatBtn'));

// Open chat modal
document.getElementById('openChatBtn').addEventListener('click', (e) => {
    e.preventDefault();
    console.log("Chat button clicked. Current state:", isChatOpen);
    
    // Toggle chat state
    isChatOpen = !isChatOpen;
    
    // Toggle active class for visibility
    if (isChatOpen) {
        chatModal.classList.add('active');
    } else {
        chatModal.classList.remove('active');
    }
    
    // Only create WebSocket if needed
    if (isChatOpen && (!chatSocket || chatSocket.readyState === WebSocket.CLOSED)) {
        console.log("Initializing WebSocket connection...");
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const socketUrl = protocol + window.location.host;
        console.log("Connecting to:", socketUrl);
        
        try {
            chatSocket = new WebSocket(socketUrl);
            
            chatSocket.onopen = () => {
                console.log("WebSocket connection established");
                chatSocket.send(JSON.stringify({
                    type: 'identify',
                    role: 'client',
                    clientId: clientId
                }));
                
                addSystemMessage('Connected to support');
                loadConversationHistory();
            };
            
            chatSocket.onmessage = (event) => {
                console.log("Message received:", event.data);
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'chat') {
                        if (data.from === 'admin') {
                            addAdminMessage(data.message);
                        } else if (data.from === 'ai' || data.from === 'shinyspace') {
                            addAIMessage(data.message);
                        }
                    }
                    else if (data.type === 'history') {
                        displayHistory(data.messages);
                    }
                    else if (data.type === 'error') {
                        addSystemMessage(data.message);
                    }
                } catch (error) {
                    console.error('Error parsing message:', error);
                    addSystemMessage('Error receiving message. Please try again.');
                }
            };
            
            chatSocket.onclose = () => {
                console.log("WebSocket connection closed");
                addSystemMessage('Connection closed');
            };
            
            chatSocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                addSystemMessage('Connection error');
            };
        } catch (error) {
            console.error("WebSocket initialization error:", error);
            addSystemMessage('Failed to connect to chat service');
        }
    } else if (!isChatOpen) {
        console.log("Closing chat by user request");
    }
});

// Close chat modal
document.getElementById('closeChat').addEventListener('click', () => {
    console.log("Close button clicked");
    chatModal.classList.remove('active');
    isChatOpen = false;
    if (chatSocket) {
        chatSocket.close();
    }
});

// Close when clicking outside modal
window.addEventListener('click', (e) => {
    if (e.target === chatModal) {
        console.log("Clicked outside modal - closing");
        chatModal.classList.remove('active');
        isChatOpen = false;
        if (chatSocket) {
            chatSocket.close();
        }
    }
});

// Send message
document.getElementById('sendMessage').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message) {
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            console.log("Sending message:", message);
            chatSocket.send(JSON.stringify({
                type: 'chat',
                role: 'client',
                message: message
            }));
            addClientMessage(message);
            input.value = '';
        } else {
            console.warn("Cannot send - WebSocket not open");
            addSystemMessage('Connection is not active. Please try reopening the chat.');
        }
    }
}

// Load conversation history from server
function loadConversationHistory() {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        console.log("Requesting conversation history");
        chatSocket.send(JSON.stringify({
            type: 'requestHistory',
            clientId: clientId
        }));
    }
}

// Display conversation history
function displayHistory(messages) {
    console.log("Displaying history:", messages);
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    
    messages.forEach(msg => {
        if (msg.from === 'client') {
            addClientMessage(msg.message, new Date(msg.timestamp));
        } else if (msg.from === 'admin') {
            addAdminMessage(msg.message, new Date(msg.timestamp));
        } else if (msg.from === 'ai' || msg.from === 'shinyspace') {
            addAIMessage(msg.message, new Date(msg.timestamp));
        }
    });
}

// Chat UI Functions
function addClientMessage(message, timestamp = new Date()) {
    console.log("Adding client message:", message);
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'customer');
    
    messageElement.innerHTML = `
        <div class="message-content">${message}</div>
        <div class="message-time">${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAdminMessage(message, timestamp = new Date()) {
    console.log("Adding admin message:", message);
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'admin');
    
    messageElement.innerHTML = `
        <div class="message-sender">Support</div>
        <div class="message-content">${message}</div>
        <div class="message-time">${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAIMessage(message, timestamp = new Date()) {
    console.log("Adding AI message:", message);
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'ai');
    
    // CHANGED: "AI Assistant" to "ShinySpace Assistant"
    messageElement.innerHTML = `
        <div class="message-sender">ShinySpace Assistant</div>
        <div class="message-content">${message}</div>
        <div class="message-time">${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    console.log("Adding system message:", message);
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system');
    messageElement.innerHTML = `
        <div class="message-content">${message}</div>
    `;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handle contact form submissions
document.getElementById('contactForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  
  // Get form values
  const name = e.target.querySelector('input[name="name"]').value;
  const email = e.target.querySelector('input[name="email"]').value;
  const phone = e.target.querySelector('input[name="phone"]').value;
  const message = e.target.querySelector('textarea[name="message"]').value;
  
  // Try to send via WebSocket
  if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
    chatSocket.send(JSON.stringify({
      type: 'contact',
      name,
      email,
      phone,
      message
    }));
    alert('Message sent successfully! We will respond shortly.');
    e.target.reset();
  } 
  // Fallback to HTTP
  else {
    fetch('/submit-contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, phone, message })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert('Message sent successfully! We will respond shortly.');
        e.target.reset();
      } else {
        alert('Failed to send message. Please try again.');
      }
    })
    .catch(error => {
      console.error('Error submitting contact form:', error);
      alert('Failed to send message. Please try again later.');
    });
  }
});