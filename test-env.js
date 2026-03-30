import dotenv from 'dotenv';
dotenv.config();
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) + "..." : "undefined");
console.log("API_KEY:", process.env.API_KEY ? process.env.API_KEY.substring(0, 5) + "..." : "undefined");
