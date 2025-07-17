const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

// Add sessions map for tracking authenticated connections
const sessions = new Map();

// Helper function to clean section names
const cleanSectionName = (section) => {
  return section.replace(/[^a-z0-9]/gi, '_').toLowerCase();
};

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'public/static/uploads/images/';
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const section = req.body.section ? cleanSectionName(req.body.section) : 'general';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `${section}_${uniqueSuffix}${path.extname(file.originalname)}`;
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

// Important: Define explicit routes BEFORE static middleware
// Route to serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Route to serve home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files from public/static directory under /static prefix
app.use('/static', express.static(path.join(__dirname, 'public', 'static')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Add JSON body parsing

// Handle file uploads
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Add cache-busting timestamp to URL
  res.json({
    success: true,
    filePath: `/static/uploads/images/${req.file.filename}?t=${Date.now()}`,
    fileName: req.file.filename,
    section: req.body.section
  });
});

// Handle file deletions
app.post('/delete-image', (req, res) => {
  const { fileName } = req.body;
  const filePath = path.join('public/static/uploads/images', fileName);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ success: false, message: 'Error deleting file' });
    }
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

// Endpoint to get images by section
app.get('/images/:section', (req, res) => {
  const section = cleanSectionName(req.params.section);
  const imageDir = path.join('public/static/uploads/images');
  
  fs.readdir(imageDir, (err, files) => {
    if (err) {
      console.error('Error reading image directory:', err);
      return res.status(500).json({ error: 'Unable to scan directory' });
    }
    
    // Filter images that match the section pattern
    const sectionImages = files.filter(file => {
      const filename = path.basename(file, path.extname(file));
      return filename.startsWith(`${section}_`) && 
             ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file).toLowerCase());
    });
    
    // Create cache-busted URLs
    const images = sectionImages.map(file => ({
      url: `/static/uploads/images/${file}`,
      name: file
    }));
    
    res.json(images);
  });
});

// Create WebSocket server for raw WebSocket connections
const wss = new WebSocket.Server({ noServer: true });

// Add global message counter
let messageCount = 0;

// Function to broadcast message count to all admins
function broadcastMessageCount() {
  wss.clients.forEach(client => {
    if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'messageCount', count: messageCount }));
    }
  });
}

// Handle raw WebSocket connections (for chat)
wss.on('connection', (ws) => {
  console.log('Raw WebSocket connection established');
  
  // Add ping/pong mechanism for connection health
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);
  
  ws.on('pong', () => {
    // Connection is alive - reset any failure tracking
    if (ws.failedPings) ws.failedPings = 0;
  });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'identify') {
        if (data.role === 'admin') {
          // ADMIN AUTHENTICATION
          if (data.username === 'admin' && data.password === 'admin123') {
            ws.role = 'admin';
            sessions.set(ws, { role: 'admin' });
            // Send current message count to newly connected admin
            ws.send(JSON.stringify({ 
              type: 'messageCount', 
              count: messageCount 
            }));
          }
        } else {
          ws.role = 'client';
          ws.clientId = data.clientId || `client-${Date.now()}`;
          sessions.set(ws, { role: 'client', clientId: ws.clientId });
        }
        return;
      }
      
      if (data.type === 'chat') {
        if (ws.role === 'client') {
          // Create message data with timestamp
          const messageData = {
            type: 'chat',
            from: ws.clientId,
            message: data.message,
            timestamp: new Date().toISOString()  // Add timestamp
          };
          
          // Broadcast client message to all admins
          wss.clients.forEach((client) => {
            if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(messageData));
            }
          });
          
          // Increment and broadcast message count
          messageCount++;
          broadcastMessageCount();
        } else if (ws.role === 'admin') {
          // Send admin message to specific client
          wss.clients.forEach((client) => {
            if (client.clientId === data.to && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat',
                from: 'admin',
                message: data.message,
                timestamp: new Date().toISOString()
              }));
            }
          });
        }
      }
      
      // Handle contact form submissions from clients
      if (data.type === 'contact') {
        // Broadcast contact form to all admins
        wss.clients.forEach((client) => {
          if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'contact',
              name: data.name,
              email: data.email,
              phone: data.phone,
              message: data.message,
              timestamp: new Date().toISOString()
            }));
          }
        });
        
        // Increment and broadcast message count
        messageCount++;
        broadcastMessageCount();
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    clearInterval(pingInterval);
    sessions.delete(ws);
    console.log('Raw WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clearInterval(pingInterval);
  });
});

// HTTP endpoint for contact form submissions
app.post('/submit-contact', (req, res) => {
  const { name, email, phone, message } = req.body;
  
  // Broadcast contact form to all admins via WebSocket
  wss.clients.forEach((client) => {
    if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'contact',
        name: name,
        email: email,
        phone: phone,
        message: message,
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  // Increment and broadcast message count
  messageCount++;
  broadcastMessageCount();
  
  res.json({ success: true, message: 'Message received successfully' });
});

// Socket.IO for any future Socket.IO based features
io.on('connection', (socket) => {
  console.log('Socket.IO connection established');
  // You can add Socket.IO specific features here if needed
});

// Handle upgrade requests for WebSockets
http.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Start the server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Admin URL: http://localhost:${PORT}/admin`);
  console.log(`Upload directory: ${path.resolve('public/static/uploads/images')}`);
  console.log(`Image endpoints:`);
  console.log(`  - Hero: http://localhost:${PORT}/images/hero`);
  console.log(`  - About: http://localhost:${PORT}/images/about`);
  console.log(`  - Services: http://localhost:${PORT}/images/services`);
  console.log(`  - Contact: http://localhost:${PORT}/images/contact`);
});