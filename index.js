const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const uri = process.env.MONGO_URL?.replace(/["';]+$/, "");
const JWKS_URI = process.env.JWKS_URI;
const clientUrl = process.env.CLIENT_URL || process.env.CLINT_URL;

const isVercel = Boolean(process.env.VERCEL);
const isProduction = process.env.NODE_ENV === "production" || isVercel;

if (!uri) {
  console.error("MONGO_URL is missing");
}

if (!JWKS_URI && isProduction) {
  console.warn("JWKS_URI is missing - protected routes will reject requests in production");
} else if (!JWKS_URI) {
  console.warn("JWKS_URI is missing - Auth will be disabled in development");
}

// Middleware
app.use(
  cors({
    origin: clientUrl ? [clientUrl] : true,
    credentials: true,
  })
);
app.use(express.json());

// Global cache for serverless connections
let cachedClient = null;
let cachedDb = null;

// Database connection function with caching
async function connectToDatabase() {
  if (!uri) {
    throw new Error("MONGO_URL is not configured");
  }

  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Create new connection
  console.log("🔄 Creating new database connection");
  cachedClient = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    maxPoolSize: 1, // Important for serverless
    minPoolSize: 0,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  await cachedClient.connect();
  cachedDb = cachedClient.db("Studing-room");
  
  console.log("✅ New database connection established");
  return { client: cachedClient, db: cachedDb };
}

// JWKS Setup
const JWKS = JWKS_URI ? createRemoteJWKSet(new URL(JWKS_URI)) : null;

// Authentication Middleware
const VerifiedToken = async (req, res, next) => {
  try {
    if (!JWKS) {
      if (isProduction) {
        return res.status(503).json({ error: "Auth is not configured on the server" });
      }
      console.warn("Auth disabled - JWKS not configured");
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized Access - No token provided" });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized Access - Invalid token format" });
    }

    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Unauthorized Access - Invalid token" });
  }
};

// ============= ROUTES =============

// Test route
app.get("/", (req, res) => {
  res.json({ 
    message: "Studying Room API is running!", 
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// Health check route
app.get("/health", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    await db.command({ ping: 1 });
    res.json({ 
      status: "healthy", 
      database: "connected",
      auth: JWKS ? "enabled" : "disabled"
    });
  } catch (error) {
    res.status(500).json({ 
      status: "unhealthy", 
      database: "disconnected",
      error: error.message 
    });
  }
});

// Get home rooms (limited to 8)
app.get("/home", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const roomcollection = db.collection("rooms");
    const result = await roomcollection.find().limit(8).toArray();
    res.json(result);
  } catch (error) {
    console.error("Error in /home:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all rooms
app.get("/rooms", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const roomcollection = db.collection("rooms");
    const result = await roomcollection.find().toArray();
    res.json(result);
  } catch (error) {
    console.error("Error in /rooms:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get rooms by amenity
app.get("/rooms/amenity/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { db } = await connectToDatabase();
    const roomcollection = db.collection("rooms");
    const result = await roomcollection
      .find({
        amenities: { $in: [id] },
      })
      .toArray();
    res.json(result);
  } catch (error) {
    console.error("Error in /rooms/amenity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add new room (protected)
app.post("/add-rooms", VerifiedToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const roomcollection = db.collection("rooms");
    const result = await roomcollection.insertOne(req.body);
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error("Error in /add-rooms:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all listed rooms
app.get("/listed-room", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const listedrooms = db.collection("listedrooms");
    const result = await listedrooms.find().toArray();
    res.json(result);
  } catch (error) {
    console.error("Error in /listed-room:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add to listed rooms
app.post("/listed-room-add", VerifiedToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const listedrooms = db.collection("listedrooms");
    const result = await listedrooms.insertOne(req.body);
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error("Error in /listed-room-add:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get room details by ID
app.get("/roomdetails/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid room ID format" });
    }

    const { db } = await connectToDatabase();
    const roomcollection = db.collection("rooms");
    const result = await roomcollection.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(result);
  } catch (error) {
    console.error("Error in /roomdetails:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete listed room
app.delete("/listed/:id", VerifiedToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const { db } = await connectToDatabase();
    const listedrooms = db.collection("listedrooms");
    const result = await listedrooms.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Room not found in listed" });
    }

    res.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Error in /listed/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/listed/:id", VerifiedToken, async (req, res) => {
    const {id} = req.params
    const listeeddata = req.body
      const { db } = await connectToDatabase();
    const listedrooms = db.collection("listedrooms");
    const result = await listedrooms.updateOne(
      {_id: new ObjectId(id),},
      {$set: listeeddata}
    );
    res.send(result)
});

app.patch("/rooms/:id", VerifiedToken, async (req, res) => {
    const {roomid} = req.params
    const listeeddata = req.body
     const { db } = await connectToDatabase();
    const roomcollection = db.collection("rooms");
    const result = await roomcollection.updateOne(
      {roomID: roomid ,},
      {$set: listeeddata}
    );
    res.send(result)
});

// Create booking
app.post("/bookings", VerifiedToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const bookingsroom = db.collection("bookionsroom");
    
    // Add timestamp to booking
    const bookingData = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await bookingsroom.insertOne(bookingData);
    res.json({ success: true, bookingId: result.insertedId });
  } catch (error) {
    console.error("Error in /bookings (POST):", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all bookings
app.get("/bookings", VerifiedToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const bookingsroom = db.collection("bookionsroom");
    const result = await bookingsroom.find().toArray();
    res.json(result);
  } catch (error) {
    console.error("Error in /bookings (GET):", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get bookings by user email
app.get("/bookings/user/:email", VerifiedToken, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const { db } = await connectToDatabase();
    const bookingsroom = db.collection("bookionsroom");
    const result = await bookingsroom.find({ userEmail: email }).toArray();
    res.json(result);
  } catch (error) {
    console.error("Error in /bookings/user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(500).json({ error: "Something went wrong!" });
});

// ============= SERVER START =============

// Local development only (Vercel runs the exported app as a serverless function)
if (!isVercel && !isProduction) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    connectToDatabase().catch(console.error);
  });
}

module.exports = app;