import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import Stripe from 'stripe';

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

app.get('/users', async (req, res) => {
  try {
    const users = await client.db("novacart").collection("user").find().toArray();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Better-auth uses string IDs for MongoDB by default, but let's try ObjectId if it fails, or just string.
    // Actually, better-auth might use string IDs. We'll check if they are string or ObjectId.
    // I'll update it to check both just in case, but first let's just use string ID for better auth.
    // No, better auth uses standard string generation for IDs usually, or objectIds. Let's look at the database.
    // Let's just use string first if it's a string, or ObjectId if it's a standard mongo objectId.
    // Actually, let's just do `_id: id` OR `_id: new ObjectId(id)`.
    let query: any;
    try {
      query = { _id: new ObjectId(id) };
    } catch {
      query = { _id: id };
    }
    const result = await client.db("novacart").collection("user").deleteOne(query);
    
    if (result.deletedCount === 1) {
      res.json({ message: "User deleted successfully" });
    } else {
      // Fallback if better-auth stores _id as a string instead of ObjectId
      const stringResult = await client.db("novacart").collection("user").deleteOne({ _id: id as any });
      if (stringResult.deletedCount === 1) {
        res.json({ message: "User deleted successfully" });
      } else {
        res.status(404).json({ error: "User not found" });
      }
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- CART ENDPOINTS ---

app.get('/cart/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const cart = await client.db("novacart").collection("carts").findOne({ userId });
    
    if (cart) {
      res.json(cart);
    } else {
      res.json({ userId, items: [] });
    }
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/cart/:userId/add', async (req, res) => {
  try {
    const userId = req.params.userId;
    const item = req.body;
    
    const cartCollection = client.db("novacart").collection("carts");
    const cart = await cartCollection.findOne({ userId });

    if (cart) {
      // Check if item already exists
      const existingItemIndex = cart.items.findIndex((i: any) => i._id === item._id);
      
      if (existingItemIndex > -1) {
        // Increment quantity
        cart.items[existingItemIndex].quantity += 1;
      } else {
        // Add new item with quantity 1
        cart.items.push({ ...item, quantity: 1 });
      }
      
      await cartCollection.updateOne({ userId }, { $set: { items: cart.items } });
      res.json({ message: "Item added to cart", items: cart.items });
    } else {
      // Create new cart
      const newItems = [{ ...item, quantity: 1 }];
      await cartCollection.insertOne({ userId, items: newItems });
      res.status(201).json({ message: "Cart created and item added", items: newItems });
    }
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put('/cart/:userId/item/:itemId', async (req, res) => {
  try {
    const { userId, itemId } = req.params;
    const { quantity } = req.body;
    
    if (quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be greater than 0" });
    }

    const cartCollection = client.db("novacart").collection("carts");
    const cart = await cartCollection.findOne({ userId });

    if (cart) {
      const existingItemIndex = cart.items.findIndex((i: any) => i._id === itemId);
      
      if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity = quantity;
        await cartCollection.updateOne({ userId }, { $set: { items: cart.items } });
        res.json({ message: "Quantity updated", items: cart.items });
      } else {
        res.status(404).json({ error: "Item not found in cart" });
      }
    } else {
      res.status(404).json({ error: "Cart not found" });
    }
  } catch (error) {
    console.error("Error updating cart quantity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete('/cart/:userId/item/:itemId', async (req, res) => {
  try {
    const { userId, itemId } = req.params;
    
    const cartCollection = client.db("novacart").collection("carts");
    const cart = await cartCollection.findOne({ userId });

    if (cart) {
      const updatedItems = cart.items.filter((i: any) => i._id !== itemId);
      await cartCollection.updateOne({ userId }, { $set: { items: updatedItems } });
      res.json({ message: "Item removed from cart", items: updatedItems });
    } else {
      res.status(404).json({ error: "Cart not found" });
    }
  } catch (error) {
    console.error("Error removing item from cart:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete('/cart/:userId/clear', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const cartCollection = client.db("novacart").collection("carts");
    await cartCollection.updateOne({ userId }, { $set: { items: [] } });
    
    res.json({ message: "Cart cleared", items: [] });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- WISHLIST ENDPOINTS ---

app.get('/wishlist/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const wishlist = await client.db("novacart").collection("wishlists").findOne({ userId });
    
    if (wishlist) {
      res.json(wishlist);
    } else {
      res.json({ userId, items: [] });
    }
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/wishlist/:userId/add', async (req, res) => {
  try {
    const userId = req.params.userId;
    const item = req.body;
    
    const wishlistCollection = client.db("novacart").collection("wishlists");
    const wishlist = await wishlistCollection.findOne({ userId });

    if (wishlist) {
      // Check if item already exists
      const existingItemIndex = wishlist.items.findIndex((i: any) => i._id === item._id);
      
      if (existingItemIndex === -1) {
        // Add new item
        wishlist.items.push(item);
        await wishlistCollection.updateOne({ userId }, { $set: { items: wishlist.items } });
      }
      res.json({ message: "Item added to wishlist", items: wishlist.items });
    } else {
      // Create new wishlist
      const newItems = [item];
      await wishlistCollection.insertOne({ userId, items: newItems });
      res.status(201).json({ message: "Wishlist created and item added", items: newItems });
    }
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete('/wishlist/:userId/item/:itemId', async (req, res) => {
  try {
    const { userId, itemId } = req.params;
    
    const wishlistCollection = client.db("novacart").collection("wishlists");
    const wishlist = await wishlistCollection.findOne({ userId });

    if (wishlist) {
      const updatedItems = wishlist.items.filter((i: any) => i._id !== itemId);
      await wishlistCollection.updateOne({ userId }, { $set: { items: updatedItems } });
      res.json({ message: "Item removed from wishlist", items: updatedItems });
    } else {
      res.status(404).json({ error: "Wishlist not found" });
    }
  } catch (error) {
    console.error("Error removing item from wishlist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- STRIPE & ORDERS ENDPOINTS ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-06-24.dahlia"
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { items } = req.body;
    
    // Calculate total amount in cents
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const { userId, userName, userEmail, userImage, items, totalAmount, deliveryAddress, paymentIntentId } = req.body;
    
    const order = {
      userId,
      userName,
      userEmail,
      userImage,
      items,
      totalAmount,
      deliveryAddress,
      paymentIntentId,
      status: 'processing',
      paymentStatus: 'paid',
      
      createdAt: new Date()
    };

    const ordersCollection = client.db("novacart").collection("orders");
    const result = await ordersCollection.insertOne(order);

    res.status(201).json({ message: "Order created successfully", orderId: result.insertedId });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/orders/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const ordersCollection = client.db("novacart").collection("orders");
    const orders = await ordersCollection.find({ userId }).sort({ createdAt: -1 }).toArray();
    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/admin/orders', async (req, res) => {
  try {
    const ordersCollection = client.db("novacart").collection("orders");
    const orders = await ordersCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(orders);
  } catch (error) {
    console.error("Error fetching all orders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch('/admin/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const ordersCollection = client.db("novacart").collection("orders");
    await ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status } }
    );
    res.json({ message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
  // Webhook logic
});

// AI Content History Endpoints
app.post('/ai-history', async (req, res) => {
  try {
    const historyItem = req.body;
    // historyItem should contain { email, prompt, content, date }
    if (!historyItem.email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const result = await client.db("novacart").collection("aiHistory").insertOne(historyItem);
    res.status(201).json({ insertedId: result.insertedId, ...historyItem });
  } catch (error) {
    console.error("Error saving AI history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/ai-history/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const history = await client.db("novacart").collection("aiHistory").find({ email }).sort({ date: -1 }).toArray();
    res.json(history);
  } catch (error) {
    console.error("Error fetching AI history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
// Force restart
