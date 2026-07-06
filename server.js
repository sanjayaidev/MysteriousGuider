{
  "name": "promptpro",
  "version": "1.0.0",
  "description": "AI Image Generator with Prompt Library",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "axios": "^1.4.0",
    "form-data": "^4.0.0",
    "sharp": "^0.32.1",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.0",
    "multer": "^1.4.5-lts.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}
