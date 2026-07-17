import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI as string;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("novacart").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.dir(error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Novacart server is running');
});

app.get('/products', async (req, res) => {
  try {
    const products = await client.db("novacart").collection("products").find().toArray();
    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/products', async (req, res) => {
  try {
    const product = req.body;
    const result = await client.db("novacart").collection("products").insertOne(product);
    res.status(201).json({ insertedId: result.insertedId, ...product });
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const product = await client.db("novacart").collection("products").findOne(query);
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ error: "Product not found" });
    }
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put('/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const productData = req.body;
    
    // Remove _id from productData so we don't try to update the immutable field
    delete productData._id;

    const query = { _id: new ObjectId(id) };
    const update = { $set: productData };
    const result = await client.db("novacart").collection("products").updateOne(query, update);
    
    if (result.matchedCount === 1) {
      res.json({ message: "Product updated successfully" });
    } else {
      res.status(404).json({ error: "Product not found" });
    }
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await client.db("novacart").collection("products").deleteOne(query);
    
    if (result.deletedCount === 1) {
      res.json({ message: "Product deleted successfully" });
    } else {
      res.status(404).json({ error: "Product not found" });
    }
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
