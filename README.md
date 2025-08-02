# 🌟 Shiny Space Cleaners - Web Application

[![Cleaning](https://img.shields.io/badge/Cleaning-Professional-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-18.x-green)]()
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen)]()

🔗 **Live Demo**: [https://shiny-space.onrender.com](https://shiny-space.onrender.com)

A powerful real-time customer communication platform built for **Shiny Space Cleaners**, offering encrypted chat, intelligent AI auto-responses, secure admin panel, image management, contact forms, and WebSocket support.

---

## 📦 Tech Stack

- **Node.js** (Express) — REST API + Server-side logic
- **MongoDB Atlas** (via Mongoose) — Document-based NoSQL database
- **Socket.IO & WebSocket** — Real-time bi-directional communication
- **Multer** — File/image upload management
- **Crypto (AES-256)** — Secure chat message encryption
- **Rate Limiter** — Basic API abuse protection
- **bcrypt** — Password hashing for admin accounts
- **dotenv** — Environment variable handling

---

## 🌐 Live Features

### 🗣 Real-Time Encrypted Chat (Client ↔ AI ↔ Admin)

- Clients connect to a live chat socket.
- An AI auto-responder replies intelligently using keyword detection.
- Admin is notified in real-time of new messages via WebSocket.
- Admin can jump into the conversation and reply live.
- All messages are encrypted using AES-256 before storage.
- Message history can be pulled securely by admin.

---

### 🧠 AI Auto-Responder

The system auto-replies to messages using built-in AI logic:

- Booking requests → "Sure! Would you like to schedule a time?"
- Pricing queries → "We offer flexible rates. What service are you interested in?"
- Operating hours → "We're open from 8am to 6pm, Monday to Saturday."
- Contact details → "You can reach us at 0701 234 567 or visit our location in Nairobi."
- Feedback or complaints → "We value your feedback! Please let us know more."

---

### 📷 Image Management Panel

- Upload categorized images for the frontend:
  - `hero`, `about`, `services`, etc.
- View uploaded images per section.
- Delete or replace uploaded assets.
- Uploads saved to:
/public/static/uploads/images

yaml
Copy
Edit

---

### 📬 Contact Form Handling

- Submissions are saved in MongoDB with timestamp and status.
- Admins receive form data instantly via WebSocket.
- Dedicated endpoint to fetch contact records:
GET /api/contacts

yaml
Copy
Edit

---

## 🔒 Security

- All admin passwords are hashed using bcrypt.
- Chat messages are encrypted before saving using AES-256.
- API routes are protected with:
- Rate limiting
- IP logging (optional for production)
- Role-based access

---

## 🚀 Deployment

### Render Deployment (Live)

- Hosted on: [Render](https://render.com/)
- Live URL: [https://shiny-space.onrender.com](https://shiny-space.onrender.com)

### Environment Variables

Create a `.env` file and add:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret
🛠️ Local Installation
bash
Copy
Edit
git clone https://github.com/ShimKevin/Shiny-Space.git
cd Shiny-Space
npm install
npm run dev
📂 Folder Structure
bash
Copy
Edit
Shiny-Space/
│
├── server.js               # Main Express server
├── /routes                 # Express routes (chat, auth, images, etc.)
├── /controllers            # Logic for each route
├── /models                 # Mongoose schemas
├── /middleware             # Auth, rate limiter, error handling
├── /public
│   └── /static/uploads     # Uploaded image files
├── /views                  # Frontend HTML templates
├── .env                    # Environment config
└── README.md               # This file
⚡ Sample Admin Credentials (for dev only)
These are for local testing only. Always replace with secure credentials in production.

env
Copy
Edit
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
🤝 Contributing
Contributions are welcome!

Fork the repo

Create a feature branch: git checkout -b feature-name

Commit your changes: git commit -m 'Add feature'

Push to the branch: git push origin feature-name

Open a pull request

👨‍💻 Author
Kevin Shimanjala
🔗 GitHub
📧 kevinshimanjala@gmail.com

📝 License
This project is licensed under the MIT License.