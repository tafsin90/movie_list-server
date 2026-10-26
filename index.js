const express = require('express');
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient} = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();
const port = process.env.PORT || 5000;


const client = new MongoClient(process.env.MONGO_URI);
 async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
// Call this only when your application terminates
 async function disconnectFromMongoDB() {
  await client.close();
}

// Call this only when your application terminates
//  async function disconnectFromMongoDB() {
//   await client.close();
// }
connectToMongoDB(); 

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})