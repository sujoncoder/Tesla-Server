const express = require("express");
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.f9slz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri);

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function verifyToken(req, res, next) {
  const header = req.headers;
  if (header?.authorization?.startsWith("Bearer ")) {
    const token = header.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch (error) {}
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("sorumCars");
    const carsCollection = database.collection("cars");
    const usersCollection = database.collection("users");
    const ordersCollection = database.collection("orders");
    const reveiwCollection = database.collection("review");

    // Validate Admin Route
    const handleAdminRoute = async (req, res, callBackFun) => {
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          callBackFun();
        } else {
          res.status(403).json({
            acknowledged: false,
            message: "Admin can access only this route",
          });
        }
      } else {
        res.status(401).json({
          acknowledged: false,
          message: "This route can access only authorized users",
        });
      }
    };

    // Get limited cars
    app.get("/carshome", async (req, res) => {
      const cursor = await carsCollection.find({}).limit(6);
      const result = await cursor.toArray();
      res.json(result);
    });
    // Get all cars
    app.get("/cars", async (req, res) => {
      const cursor = await carsCollection.find({});
      const result = await cursor.toArray();
      res.json(result);
    });

    // Add A Product
    app.post("/cars", verifyToken, async (req, res) => {
      handleAdminRoute(req, res, async () => {
        const doc = req.body;
        const query = { title: doc.title };

        const car = await carsCollection.findOne(query);

        if (car === null) {
          const result = await carsCollection.insertOne(doc);
          res.json(result);
        } else {
          res.json({
            acknowledged: false,
            message: "This Car Already Added",
          });
        }
      });
    });

    // Delete Product
    app.delete("/cars/:id", verifyToken, async (req, res) => {
      handleAdminRoute(req, res, async () => {
        const id = req.params.id;
        if (ObjectId.isValid(id)) {
          const query = {
            _id: ObjectId(id),
          };
          const car = await carsCollection.findOne(query);
          if (car.main) {
            res.json({
              acknowledged: false,

              message: "You can delete only your added products!",
            });
          } else {
            const result = await carsCollection.deleteOne(query);
            res.send(result);
          }
        } else {
          res.json({
            acknowledged: false,
            message: "Please send valid product id!",
          });
        }
      });
    });

    // Get A product

    app.get("/cars/:id", async (req, res) => {
      const id = req.params.id;
      if (ObjectId.isValid(id)) {
        const query = {
          _id: ObjectId(id),
        };
        const result = await carsCollection.findOne(query);
        res.json(result);
      } else {
        res.json({
          acknowledged: false,
          message: "Please send valid product id!",
        });
      }
    });

    // Edit Product
    app.put("/cars/:id", verifyToken, async (req, res) => {
      handleAdminRoute(req, res, async () => {
        const id = req.params.id;
        if (ObjectId.isValid(id)) {
          const { _id, ...rest } = req.body;
          const options = { upsert: false };
          const filter = {
            _id: ObjectId(id),
          };
          const updateDoc = {
            $set: rest,
          };
          const result = await carsCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.json(result);
        } else {
          res.json({
            acknowledged: false,
            message: "Please send valid product id!",
          });
        }
      });
    });

    // Add Order
    app.post("/orders", async (req, res) => {
      const email = req.query.email;
      const { _id, ...rest } = req.body;
      const doc = {
        ...rest,
        email,
        uniqueId: _id,
      };
      const result = await ordersCollection.insertOne(doc);
      res.json(result);
    });

    // Get All Order
    app.get("/orders", verifyToken, async (req, res) => {
      handleAdminRoute(req, res, async () => {
        const cursor = await ordersCollection.find({});
        const result = await cursor.toArray();
        res.json(result);
      });
    });
    // Get A Order
    app.get("/order/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = {
        _id: ObjectId(id),
      };
      const result = await ordersCollection.findOne(query);
      res.json(result);
    });

    // Update Order
    app.patch("/updateOrderStatus", verifyToken, async (req, res) => {
      handleAdminRoute(req, res, async () => {
        const { id, status } = req.body;
        const filter = { _id: ObjectId(id) };
        const option = { upsert: false };
        const updateDoc = {
          $set: {
            status,
          },
        };
        const result = await ordersCollection.updateOne(
          filter,
          updateDoc,
          option
        );
        res.json(result);
      });
    });

    // Get single user Order
    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const cursor = await ordersCollection.find(query);
      const result = await cursor.toArray();
      res.json(result);
    });

    // Delete Order
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: ObjectId(id),
      };
      const result = await ordersCollection.deleteOne(query);
      res.json(result);
    });

    // Add Review
    app.put("/review", async (req, res) => {
      const { _id, ...rest } = req.body;
      const filter = { email: rest.user?.email };
      const options = { upsert: true };
      const updateDoc = {
        $set: rest,
      };

      const result = await reveiwCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });
    // Get A Review
    app.get("/review/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await reveiwCollection.findOne(query);
      res.json(result);
    });
    // Get Review
    app.get("/review", async (req, res) => {
      const cursor = await reveiwCollection.find({});
      const result = await cursor.toArray();
      res.json(result);
    });

    // Add User
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          email: user.email,
          name: user.name,
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    // Make Admin
    app.put("/users/admin/:email", verifyToken, async (req, res) => {
      handleAdminRoute(req, res, async () => {
        const email = req.params?.email;
        const query = {
          email: email,
        };
        const user = await usersCollection.findOne(query);
        if (user !== null) {
          const options = { upsert: false };
          const updateDoc = {
            $set: {
              role: "admin",
            },
          };
          const filter = { email: email };
          const result = await usersCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.json(result);
        } else {
          res.json({ acknowledged: false, message: "User Not Found" });
        }
      });
    });

    // Remove Admin
    app.delete("/users/admin/:email", verifyToken, async (req, res) => {
      handleAdminRoute(req, res, async () => {
        const email = req.params?.email;
        const query = { email: email };

        const user = await usersCollection.findOne(query);

        if (user.mainAdmin) {
          res.json({
            acknowledged: false,
            message: "Main Admin Can Not Delete!",
          });
        } else {
          const { role, ...rest } = user;
          const userData = { ...rest };
          const replacement = userData;
          const result = await usersCollection.replaceOne(query, replacement);

          if (result.acknowledged) {
            res.json(result);
          } else {
            res.json({ acknowledged: false, message: "User Not Found" });
          }
        }
      });
    });

    // Get Is Admin
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      } else {
        isAdmin = false;
      }
      res.json({ admin: isAdmin });
    });

    // Get Users Admin
    app.get("/users", async (req, res) => {
      const query = { role: "admin" };
      const cursor = await usersCollection.find(query);
      const result = await cursor.toArray();
      res.json(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Running Sorum Server");
});

app.listen(port, () => {
  console.log("Server running at port:", port);
});
