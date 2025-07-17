// Generate unique client ID
const clientId = 'client-' + Math.random().toString(36).substr(2, 9);
let chatSocket;

// Update WebSocket connection with proper protocol
const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

// Open chat modal
document.getElementById('openChat').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('chatModal').style.display = 'flex';
    
    // Connect to WebSocket server with proper protocol
    chatSocket = new WebSocket(protocol + window.location.host);
    
    chatSocket.onopen = () => {
        // Identify as client
        chatSocket.send(JSON.stringify({
            type: 'identify',
            role: 'client',
            clientId: clientId
        }));
        
        addSystemMessage('Connected to support');
    };
    
    chatSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'chat' && data.from === 'admin') {
                addAdminMessage(data.message);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            addSystemMessage('Error receiving message. Please try again.');
        }
    };
    
    chatSocket.onclose = () => {
        addSystemMessage('Connection closed');
    };
    
    chatSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        addSystemMessage('Connection error');
    };
});

// Close chat modal
document.getElementById('closeChat').addEventListener('click', () => {
    document.getElementById('chatModal').style.display = 'none';
    if (chatSocket) {
        chatSocket.close();
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
    
    if (message && chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        // Send message to server
        chatSocket.send(JSON.stringify({
            type: 'chat',
            role: 'client',
            message: message
        }));
        
        // Add to chat UI
        addClientMessage(message);
        input.value = '';
    }
}

// Handle contact form submissions
document.getElementById('contactForm').addEventListener('submit', (e) => {
  e.preventDefault();
  
  // Get form values
  const name = e.target.querySelector('input[type="text"]').value;
  const email = e.target.querySelector('input[type="email"]').value;
  const phone = e.target.querySelector('input[type="tel"]').value;
  const message = e.target.querySelector('textarea').value;
  
  // Try to send via WebSocket if available
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
  // Fallback to HTTP if WebSocket not available
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

// Chat UI Functions
function addClientMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'customer');
    
    // Add timestamp
    const time = new Date();
    messageElement.innerHTML = `
        <div class="message-content">${message}</div>
        <div class="message-time">${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAdminMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'admin');
    
    // Add timestamp
    const time = new Date();
    messageElement.innerHTML = `
        <div class="message-sender">Support</div>
        <div class="message-content">${message}</div>
        <div class="message-time">${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system');
    messageElement.innerHTML = `
        <div class="message-content">${message}</div>
    `;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}