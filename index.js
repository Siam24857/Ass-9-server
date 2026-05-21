const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs')

dotenv.config()

const app = express()
const port = process.env.PORT || 5000

const uri = process.env.MONGO_URL

app.use(cors())
app.use(express.json())

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  } 
})

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLINT_URL}/api/auth/jwks`)     
)

 const VerifiedToken = async(req, res, next) => {
    
  const tokendata = req.headers.authorization
  if(!tokendata){
    return res.status(401).send("Unauthorized Access")
  }
  const tokenin = tokendata.split(' ')[1]
  if(!tokenin){
    return res.status(401).send("Unauthorized Access")
  }

  console.log(tokenin)


   try{

   const { payload } = await jwtVerify(tokenin, JWKS)
   console.log(payload)
   next()
   }catch (error) {  
     return res.status(401).send("Unauthorized Access")
   }

}

async function run() {
  try {
    await client.connect()

    const myDB = client.db("Studing-room")
    const roomcollection = myDB.collection("rooms")
    const listedrooms = myDB.collection("listedrooms")
    const bookinsroom = myDB.collection("bookionsroom")
 
    app.get('/home', async (req, res) => {
      const result = await roomcollection.find().limit(8).toArray()
      res.send(result)
    })

 
    app.get('/rooms', async (req, res) => {
      const result = await roomcollection.find().toArray()
      res.send(result)
    })
 
    app.get('/rooms/:id', async (req, res) => {
      const { id } = req.params

      const result = await roomcollection.find({
        amenities: { $in: [id] }
      }).toArray()

      res.send(result)
    })

    // ADD ROOM
    app.post('/add-rooms', async (req, res) => { 
      const roomdata = req.body
      const result = await roomcollection.insertOne(roomdata)
      res.send(result)
    })
 
    app.get('/listed-room',  async (req, res) => {
         const result = await listedrooms.find().toArray()
      res.send(result)
    })
    app.post('/listed-room-add', async (req, res) => {  
          const roomdata = req.body
      const result = await listedrooms.insertOne(roomdata)
      res.send(result)
    })
   app.get('/roomdetails/:id', async (req, res) => {
  const { id } = req.params;

  const result = await roomcollection.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
});
   app.delete('/listed/:id', async (req, res) => {
  const { id } = req.params;

  const result = await listedrooms.deleteOne({
    _id: new ObjectId(id),
  });

  res.send(result); 
});
   app.post('/bookings', async (req, res) => {
   const bokingdata = req.body
   const result = await bookinsroom.insertOne(bokingdata)
   res.send(result)
});
   
   app.get('/bookings', async (req, res) => {
   const result = await bookinsroom.find().toArray()
      res.send(result)
});
   
 

    await client.db("admin").command({ ping: 1 })
    console.log("MongoDB Connected Successfully!")

  } catch (err) {
    console.log(err)
  }
}

run().catch(console.dir)

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})