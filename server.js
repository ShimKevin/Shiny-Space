if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const IV_LENGTH = 16;

// Validate required environment variables
if (!ENCRYPTION_KEY) {
  console.error('FATAL ERROR: ENCRYPTION_KEY is not defined');
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined');
  process.exit(1);
}
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('FATAL ERROR: ADMIN credentials are not defined');
  process.exit(1);
}

// Define MongoDB schemas
const messageSchema = new mongoose.Schema({
  clientId: String,
  from: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
  encrypted: Boolean
});

const conversationSchema = new mongoose.Schema({
  clientId: String,
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});

// ADDED: Contact Form Schema
const contactFormSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  message: String,
  timestamp: { type: Date, default: Date.now }
});

// Create models
const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Admin = mongoose.model('Admin', adminSchema);
const ContactForm = mongoose.model('ContactForm', contactFormSchema); // ADDED

// FIXED ENCRYPTION FUNCTIONS
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32); // Derive 32-byte key
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Fallback to plaintext
  }
}

function decrypt(text) {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32); // Derive 32-byte key
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return text; // Fallback to plaintext
  }
}

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});

app.use('/api/', apiLimiter);

// Create admin only if doesn't exist
async function createInitialAdmin() {
  try {
    const existingAdmin = await Admin.findOne({ username: ADMIN_USERNAME });
    
    if (existingAdmin) {
      console.log(`Admin already exists: ${ADMIN_USERNAME}`);
      return;
    }
    
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const admin = new Admin({
      username: ADMIN_USERNAME,
      password: hashedPassword
    });
    
    await admin.save();
    console.log('Admin user created');
  } catch (err) {
    console.error('Error creating admin:', err);
  }
}

// Helper functions
const sessions = new Map();
const cleanSectionName = (section) => section.replace(/[^a-z0-9]/gi, '_').toLowerCase();

// Configure file uploads with cross-platform paths
const uploadPath = path.join('public', 'static', 'uploads', 'images');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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

// Routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/static', express.static(path.join(__dirname, 'public', 'static')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// File upload endpoint
app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    success: true,
    filePath: `/static/uploads/images/${req.file.filename}?t=${Date.now()}`,
    fileName: req.file.filename,
    section: req.body.section
  });
});

// File deletion endpoint
app.post('/delete-image', (req, res) => {
  const { fileName } = req.body;
  const filePath = path.join(uploadPath, fileName);
  
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).json({ success: false, message: 'Error deleting file' });
    }
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

// Image retrieval endpoint
app.get('/images/:section', (req, res) => {
  const section = cleanSectionName(req.params.section);
  
  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      console.error('Error reading image directory:', err);
      return res.status(500).json({ error: 'Unable to scan directory' });
    }
    
    const sectionImages = files.filter(file => {
      const filename = path.basename(file, path.extname(file));
      return filename.startsWith(`${section}_`) && 
             ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file).toLowerCase());
    });
    
    const images = sectionImages.map(file => ({
      url: `/static/uploads/images/${file}`,
      name: file
    }));
    
    res.json(images);
  });
});

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });
let messageCount = 0;
const clientMessageRates = new Map();

// Broadcast message count to admins
function broadcastMessageCount() {
  wss.clients.forEach(client => {
    if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'messageCount', count: messageCount }));
    }
  });
}

// Enhanced AI response handler
async function getAIResponse(message) {
  const userMessage = message.toLowerCase();
  
  if (userMessage.includes('service') || userMessage.includes('offer')) {
    return "We offer residential, commercial, and post-construction cleaning services. Which type are you interested in?";
  } 
  else if (userMessage.includes('price') || userMessage.includes('cost') || userMessage.includes('how much')) {
    return "Our pricing depends on the size of the space and the specific services needed. Could you share more details about your requirements?";
  } 
  else if (userMessage.includes('book') || userMessage.includes('schedule') || userMessage.includes('appointment')) {
    return "Great! Please provide us your full details (Your Name and Phone Number), your preferred date and time, and we'll confirm availability and contact you to finalize the booking.";
  } 
  else if (userMessage.includes('hello') || userMessage.includes('hi') || userMessage.includes('hey')) {
    return "Hello! Welcome to Shiny Space Cleaners. How can I assist you today?";
  }
  else if (userMessage.includes('location') || userMessage.includes('where')) {
    return "We are located in Machakos and Nairobi, Kenya. We serve the entire Machakos, Nairobi area and its surroundings. How can we assist you today?";
  }
  else if (userMessage.includes('contact') || userMessage.includes('reach') || userMessage.includes('get in touch')) {
    return "You can reach us at 0794785228 or email us at shinyspace41@gmail.com. How can I assist you further?";
  }
  else if (userMessage.includes('hours') || userMessage.includes('open') || userMessage.includes('working hours')) {
    return "We are open Monday to Saturday from 8 AM to 6 PM. How can I assist you today?";
  }
  else if (userMessage.includes('cleaning') || userMessage.includes('clean')) {
    return "We specialize in residential, commercial, and post-construction cleaning. What type of cleaning service are you interested in?";
  }
  else if (userMessage.includes('help') || userMessage.includes('support')) {
    return "I'm here to help! Please let me know what you need assistance with, and I'll do my best to assist you.";
  }
  else if (userMessage.includes('goodbye') || userMessage.includes('bye') || userMessage.includes('see you')) {
    return "Goodbye! Thank you for reaching out to Shiny Space Cleaners. Have a great day!";
  }
  else if (userMessage.includes('problem') || userMessage.includes('issue') || userMessage.includes('complaint')) {
    return "I'm sorry to hear that you're experiencing an issue. Please provide more details about the problem, and I'll do my best to assist you.";
  }
  else if (userMessage.includes('feedback') || userMessage.includes('suggestion')) {
    return "We appreciate your feedback! Please share your suggestions or comments, and we'll take them into consideration to improve our services.";
  }
  else if (userMessage.includes('residential') || userMessage.includes('commercial') || userMessage.includes('post-construction')) {
    return "Great! Please provide us your full details (Your Name and Phone Number), your preferred date and time, and we'll confirm availability and contact you to finalize the booking.";
  }
  else if (userMessage.includes('thanks') || userMessage.includes('thank you')) {
    return "You're welcome! If you have any more questions or need assistance, feel free to ask.";
  } 
  else {
    return "I'm sorry, I didn't understand that. Could you please rephrase your question?";
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Raw WebSocket connection established');
  
  // Ping/pong health monitoring
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      ws.failedPings = (ws.failedPings || 0) + 1;
      
      if (ws.failedPings > 3) {
        console.log('Closing unresponsive connection');
        ws.terminate();
      }
    }
  }, 30000);
  
  ws.on('pong', () => ws.failedPings = 0);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const clientId = data.clientId || ws.clientId || 'unknown';
      
      // Rate limiting
      if (!clientMessageRates.has(clientId)) {
        clientMessageRates.set(clientId, []);
      }
      
      const clientMessages = clientMessageRates.get(clientId);
      const now = Date.now();
      clientMessages.push(now);
      
      // Remove old messages
      while (clientMessages.length > 0 && now - clientMessages[0] > 60000) {
        clientMessages.shift();
      }
      
      if (clientMessages.length > 10) {
        console.warn(`Rate limit exceeded for client: ${clientId}`);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Message rate limit exceeded. Please wait before sending more messages.'
        }));
        return;
      }
      
      if (data.type === 'identify') {
        if (data.role === 'admin') {
          try {
            const admin = await Admin.findOne({ username: data.username });
            
            if (admin) {
              const passwordMatch = await bcrypt.compare(data.password, admin.password);
              
              if (passwordMatch) {
                ws.role = 'admin';
                sessions.set(ws, { role: 'admin' });
                ws.send(JSON.stringify({ type: 'messageCount', count: messageCount }));
                
                const conversations = await Conversation.find().sort({ updatedAt: -1 });
                ws.send(JSON.stringify({ type: 'conversations', data: conversations }));
              } else {
                ws.send(JSON.stringify({ type: 'authError', message: 'Invalid admin credentials' }));
              }
            } else {
              ws.send(JSON.stringify({ type: 'authError', message: 'Admin account not found' }));
            }
          } catch (err) {
            console.error('Admin auth error:', err);
            ws.send(JSON.stringify({ type: 'authError', message: 'Authentication error' }));
          }
        } else {
          ws.role = 'client';
          ws.clientId = data.clientId || `client-${Date.now()}`;
          sessions.set(ws, { role: 'client', clientId: ws.clientId });
          
          const conversation = await Conversation.findOne({ clientId: ws.clientId });
          if (conversation) {
            ws.send(JSON.stringify({ type: 'history', messages: conversation.messages }));
          }
        }
        return;
      }
      
      // Handle history request
      if (data.type === 'requestHistory') {
        const conversation = await Conversation.findOne({ clientId: data.clientId });
        if (conversation) {
          // Send history to admin
          wss.clients.forEach(client => {
            if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'history',
                clientId: data.clientId,
                messages: conversation.messages
              }));
            }
          });
        }
        return;
      }
      
      if (data.type === 'chat') {
        if (ws.role === 'client') {
          const plainText = data.message; // Keep original plaintext
          const encryptedMessage = encrypt(plainText);
          
          const messageData = {
            type: 'chat',
            from: ws.clientId,
            message: plainText, // Send plaintext to admin
            timestamp: new Date().toISOString(),
            encrypted: false
          };
          
          const messageDoc = new Message({
            clientId: ws.clientId,
            from: 'client',
            message: encryptedMessage, // Store encrypted
            encrypted: true
          });
          
          // Update conversation with new message
          await Conversation.findOneAndUpdate(
            { clientId: ws.clientId },
            { 
              $push: { messages: messageDoc }, 
              $set: { updatedAt: new Date() }
            },
            { upsert: true, new: true }
          );
          
          // Broadcast to admins (with plaintext)
          wss.clients.forEach((client) => {
            if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(messageData));
            }
          });
          
          messageCount++;
          broadcastMessageCount();
          
          // FIXED: AI RESPONSE HANDLING
          setTimeout(async () => {
            const aiResponse = await getAIResponse(plainText);
            const encryptedResponse = encrypt(aiResponse);
            
            // Create document for storage (encrypted)
            const aiMessageDoc = new Message({
              clientId: ws.clientId,
              from: 'shinyspace',
              message: encryptedResponse,
              encrypted: true
            });
            
            // Update conversation with AI response
            await Conversation.findOneAndUpdate(
              { clientId: ws.clientId },
              { 
                $push: { messages: aiMessageDoc }, 
                $set: { updatedAt: new Date() }
              }
            );
            
            // Send DECRYPTED response to client
            ws.send(JSON.stringify({
              type: 'chat',
              from: 'shinyspace',
              message: aiResponse,  // Plaintext response
              timestamp: new Date().toISOString()
            }));
            
            // Notify admins with plaintext response
            wss.clients.forEach((client) => {
              if (client.role === 'admin' && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'chat',
                  from: 'shinyspace',
                  message: aiResponse,  // Plaintext response
                  timestamp: new Date().toISOString()
                }));
              }
            });
          }, 1500);
        } else if (ws.role === 'admin') {
          const plainText = data.message; // Keep original plaintext
          const encryptedMessage = encrypt(plainText);
          
          const messageDoc = new Message({
            clientId: data.to,
            from: 'admin',
            message: encryptedMessage, // Store encrypted
            encrypted: true
          });
          
          // Update conversation with admin message
          await Conversation.findOneAndUpdate(
            { clientId: data.to },
            { 
              $push: { messages: messageDoc }, 
              $set: { updatedAt: new Date() }
            }
          );
          
          // Send plaintext to client
          wss.clients.forEach((client) => {
            if (client.clientId === data.to && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'chat',
                from: 'admin',
                message: plainText,  // Plaintext to client
                timestamp: new Date().toISOString(),
                encrypted: false
              }));
            }
          });
        }
      }
      
      if (data.type === 'contact') {
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
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Connection error'
        }));
    }
  });
});

// UPDATED: Contact form endpoint to save to database
app.post('/submit-contact', async (req, res) => {
  const { name, email, phone, message } = req.body;
  
  try {
    // Save to database
    const contact = new ContactForm({ name, email, phone, message });
    await contact.save();

    // Broadcast to admins via WebSocket
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
    
    messageCount++;
    broadcastMessageCount();
    res.json({ success: true, message: 'Message received successfully' });
  } catch (err) {
    console.error('Error saving contact form:', err);
    res.status(500).json({ error: 'Failed to save contact form' });
  }
});

// ADDED: Endpoint to get contact forms
app.get('/api/contact-forms', async (req, res) => {
  try {
    const forms = await ContactForm.find().sort({ timestamp: -1 });
    res.json(forms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contact forms' });
  }
});

// API endpoints
app.get('/api/conversations', async (req, res) => {
  try {
    const conversations = await Conversation.find().sort({ updatedAt: -1 });
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversation/:clientId', async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ clientId: req.params.clientId });
    
    if (conversation) {
      // Decrypt messages for the API
      const decryptedMessages = conversation.messages.map(msg => {
        const messageObj = msg.toObject();
        if (messageObj.encrypted) {
          messageObj.message = decrypt(messageObj.message);
        }
        return messageObj;
      });
      
      res.json({ ...conversation.toObject(), messages: decryptedMessages });
    } else {
      res.status(404).json({ error: 'Conversation not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('Socket.IO connection established');
});

// WebSocket upgrade handler
http.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// MongoDB connection
const connectToDatabase = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      auth: {
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD
      },
      authSource: 'admin'
    });
    console.log('MongoDB connected successfully');
    
    // Create admin user in the admin database
    await createInitialAdmin();
    startServer();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 3000;

function startServer() {
  http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin URL: http://localhost:${PORT}/admin`);
    console.log(`Upload directory: ${path.resolve(uploadPath)}`);
    console.log(`Image endpoints:`);
    console.log(`  - Hero: http://localhost:${PORT}/images/hero`);
    console.log(`  - About: http://localhost:${PORT}/images/about`);
    console.log(`  - Services: http://localhost:${PORT}/images/services`);
    console.log(`  - Contact: http://localhost:${PORT}/images/contact`);
    console.log(`  - Contact Forms: http://localhost:${PORT}/api/contact-forms`);
  });
}

// Connect to database and start server
connectToDatabase();