const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const uri = process.env.MONGO_URL;

if (!uri) {
  throw new Error("❌ MONGO_URL is missing in .env");
}

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// FIXED: safe env variable
const JWKS_URL = process.env.CLIENT_URL;

if (!JWKS_URL) {
  console.warn("⚠️ CLIENT_URL is missing");
}

const JWKS = JWKS_URL
  ? createRemoteJWKSet(new URL(`${JWKS_URL}/api/auth/jwks`))
  : null;

const VerifiedToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).send("Unauthorized Access");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).send("Unauthorized Access");
    }

    if (!JWKS) {
      return res.status(500).send("JWKS not configured");
    }

    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).send("Unauthorized Access");
  }
};

async function run() {
  try {
    await client.connect();

    const myDB = client.db("Studing-room");
    const roomcollection = myDB.collection("rooms");
    const listedrooms = myDB.collection("listedrooms");
    const bookinsroom = myDB.collection("bookionsroom");

    app.get("/home", async (req, res) => {
      const result = await roomcollection.find().limit(8).toArray();
      res.send(result);
    });

    app.get("/rooms", async (req, res) => {
      const result = await roomcollection.find().toArray();
      res.send(result);
    });

    app.get("/rooms/:id", async (req, res) => {
      const { id } = req.params;

      const result = await roomcollection
        .find({
          amenities: { $in: [id] },
        })
        .toArray();

      res.send(result);
    });

    app.post("/add-rooms", async (req, res) => {
      const result = await roomcollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/listed-room", async (req, res) => {
      const result = await listedrooms.find().toArray();
      res.send(result);
    });

    app.post("/listed-room-add", async (req, res) => {
      const result = await listedrooms.insertOne(req.body);
      res.send(result);
    });

    app.get("/roomdetails/:id", async (req, res) => {
      const result = await roomcollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    app.delete("/listed/:id", async (req, res) => {
      const result = await listedrooms.deleteOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const result = await bookinsroom.insertOne(req.body);
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      const result = await bookinsroom.find().toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB Connected Successfully!");
  } catch (err) {
    console.error("❌ Server Crash:", err);
  }
}

run();

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});