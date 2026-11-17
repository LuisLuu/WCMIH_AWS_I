
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { verifyToken } = require("./src/api/middlewares/auth");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const CLIENT_URL = process.env.CLIENT_URL;

if (!CLIENT_URL || !process.env.JWT_SECRET) {
  throw new Error("Missing CLIENT_URL or JWT_SECRET");
}

// Cho phép React frontend truy cập qua trình duyệt

const allowedOrigin = process.env.CLIENT_URL;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === CLIENT_URL) {
      callback(null, true);
    } else {
      callback(new Error("CORS_NOT_ALLOWED"));
    }
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Xử lý yêu cầu từ Origin không được phép
app.use((err, req, res, next) => {
  if (err.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({
      error: "Origin not allowed"
    });
  }

  next(err);
});

app.use(express.json({ limit: "100kb" }));

// Kiểm tra server
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Project V API is running"
  });
});

// API được bảo vệ bằng JWT
app.get("/api/protected", verifyToken, (req, res) => {
  res.json({
    message: "Authorized",
    userId: req.user.sub
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
