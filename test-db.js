require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shiny-space-cleaners';

async function testConnection() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully!');
    
    // Test admin collection
    const Admin = mongoose.model('Admin', new mongoose.Schema({
      username: String,
      password: String
    }));
    
    const admins = await Admin.find();
    console.log(`📊 Found ${admins.length} admins`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  }
}

testConnection();