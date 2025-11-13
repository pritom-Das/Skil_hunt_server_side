const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const admin = require("firebase-admin");
const port = 3000 || process.env.PORT;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Freelance Market place backed server is on now ");
});

const serviceAccount = require("./sillhunt_firebase_sdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  const authorized = req.headers.authorization;
  // console.log(authorized);
  if (!authorized) {
    return res
      .status(401)
      .send({ message: "Unauthorized access who are you you" });
  }
  const token = req.headers.authorization.split(" ")[1];
  console.log(token);
  if (!token) {
    return res
      .status(401)
      .send({ message: "Unauthorized access who are you bitch" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("Decoded token", decoded);
    req.token_email = decoded.email;
    next();
  } catch {
    return res.send({ message: "Error code 20" });
  }
};

// Databse connection
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const uri =
//   "mongodb+srv://SkillHunt:EyTaVrBbPU1Y0iTK@cluster0.ijj1cbi.mongodb.net/?appName=Cluster0";
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ijj1cbi.mongodb.net/?appName=Cluster0`;

//   MongoDb Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const database = client.db("SkillHunt");
    const jobsCollection = database.collection("jobs");

    const acceptedJobCollection = database.collection("accepted_jobs");

    app.get("/jobs", async (req, res) => {
      const userEmail = req.query.email;
      const query = { status: "pending", postedBy_email: { $ne: userEmail } };
      const cursor = jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // add a job
    app.post("/jobs", async (req, res) => {
      const newjob = req.body;

      const result = await jobsCollection.insertOne(newjob);
      res.send(result);
    });
    // get job by id
    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });
    app.delete("/jobs/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await jobsCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to delete job", err });
      }
    });

    app.patch("/jobs/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedJob = req.body;

      try {
        // Fetch the existing job from DB
        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
        if (!job) return res.status(404).send({ message: "Job not found" });

        let updateFields = {};

        if (updatedJob.status === "accepted") {
          // Accept job case
          if (job.postedBy_email === req.token_email) {
            return res
              .status(403)
              .send({ message: "You cannot accept your own job" });
          }

          // Only update accept-related fields
          updateFields = {
            status: updatedJob.status,
            acceptedBy_name: updatedJob.acceptedBy_name,
            acceptedBy_email: updatedJob.acceptedBy_email,
          };
        } else {
          // Job edit case
          if (job.postedBy_email !== req.token_email) {
            return res
              .status(403)
              .send({ message: "Only the owner can update this job" });
          }

          // Update only changed fields
          for (let key in updatedJob) {
            if (updatedJob[key] !== job[key]) {
              updateFields[key] = updatedJob[key];
            }
          }
        }

        if (Object.keys(updateFields).length === 0) {
          return res.status(400).send({ message: "No changes detected" });
        }

        const result = await jobsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        res.send({ message: "Job updated successfully", result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // delte a job
    app.delete("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne(query);
      res.send(result);
    });
    app.get("/latestJobs", async (req, res) => {
      const query = { status: "pending" };
      const cursor = jobsCollection
        .find(query)
        .sort({ createdat: -1 })
        .limit(8);
      const result = await cursor.toArray();
      res.send(result);
    });

    // my added jobs
    app.get("/myadded-jobs", verifyFirebaseToken, async (req, res) => {
      try {
        // Use the email from the verified token
        const userEmail = req.token_email;

        // Only fetch jobs posted by this user
        const query = { postedBy_email: userEmail };
        const cursor = jobsCollection.find(query);
        const result = await cursor.toArray();

        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // post accted jobs
    // app.post("/acceptedjobs", async (req, res) => {
    //   const accepted_job = req.body;
    //   const result = await acceptedJobCollection.insertOne(accepted_job);
    //   res.send(result);
    // });

    app.get("/acceptedjobs", verifyFirebaseToken, async (req, res) => {
      const userEmail = req.query.email;

      if (!userEmail) {
        return res
          .status(400)
          .send({ message: "Email query parameter is required" });
      }

      if (userEmail !== req.token_email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      try {
        const query = { status: "accepted", acceptedBy_email: userEmail };
        const cursor = jobsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.patch("/acceptedjobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedJob = req.body;
      const update = {
        $set: {
          status: updatedJob.status,
        },
      };
      const result = await jobsCollection.updateOne(query, update);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(` Application is listening on port${port} `);
});
