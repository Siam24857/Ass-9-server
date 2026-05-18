const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')

dotenv.config()

const app = express()
const port = process.env.PORT || 5000

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGO_URL;
app.use(cors())
app.use(express.json())

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


const myDB = client.db("Studing-room");
const roomcollection = myDB.collection("rooms");

async function run() {
  try {
   
    await client.connect();

    app.get('/home', async(req, res) => {
      const result = await roomcollection.find().limit(8).toArray()
      res.send(result) 
})
    app.get('/rooms', async(req, res) => {
      const result = await roomcollection.find().toArray()
      res.send(result) 
})
   app.get('/rooms/:id', async (req, res) => {

    const { id } = req.params;

    const result = await roomcollection.find({
        amenities: { $in: [id] }
    }).toArray();

    res.send(result);   
});

    
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

//
//