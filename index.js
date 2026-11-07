const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();
const port = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGO_URI);
let db;
let mediaCollection;

async function connectToMongoDB() {
  try {
    await client.connect();

    db = client.db("Frame");
    mediaCollection = db.collection("media");

    console.log("You successfully connected to MongoDB!");

    // Insert one media
    app.post("/api/media", async (req, res) => {
      try {
        const {
          userId,
          user,
          title,
          poster,
          description,
          releaseDate,
          imdbRating,
          runtime,
          seasons,
          language,
          country,
          category,
          genres,
          status,
          mediaType,
        } = req.body;

        // Check required information
        if (!userId || !title) {
          return res.status(400).json({
            message: "User ID and title are required",
          });
        }

        // Prepare media data
        const mediaData = {
          userId,
          user,
          title,
          poster,
          description,
          releaseDate,
          imdbRating: imdbRating ? Number(imdbRating) : null,
          runtime,
          seasons: seasons ? Number(seasons) : null,
          language,
          country,
          category,
          genres,
          status,
          mediaType,

          createdAt: new Date(),
        };

        // Insert into MongoDB
        const result = await mediaCollection.insertOne(mediaData);

        res.status(201).json({
          message: "Media added successfully!",
          mediaId: result.insertedId,
          media: mediaData,
        });
      } catch (error) {
        console.error("Media upload failed:", error);

        res.status(500).json({
          message: "Failed to add media",
        });
      }
    });

    return client;
  } catch (err) {
    console.dir(err);
  }
}

// Call this only when your application terminates
//  async function disconnectFromMongoDB() {
//   await client.close();
// }

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/api/media/search", async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        error: "Title is required",
      });
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
          accept: "application/json",
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.status_message || "TMDB request failed",
      });
    }

    const results = data.results.filter(
      (item) => item.media_type === "movie" || item.media_type === "tv",
    );

    res.json({
      ...data,
      results,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Something went wrong",
    });
  }
});
app.get("/api/media/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!["movie", "tv"].includes(type)) {
      return res.status(400).json({
        message: "Invalid media type",
      });
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/${type}/${id}?append_to_response=external_ids`,
      {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
          accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return res.status(response.status).json({
        message: "Failed to fetch details",
      });
    }

    const data = await response.json();

    const imdbId = type === "movie" ? data.imdb_id : data.external_ids?.imdb_id;

    let imdbRating = "";
    let language = "";
    let country = "";
    let seasons = "";

    if (imdbId && process.env.OMDB_API_KEY) {
      const omdbResponse = await fetch(
        `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`,
      );

      const omdbData = await omdbResponse.json();
      // console.log(omdbData);

      if (omdbData.Response === "True") {
        imdbRating = omdbData.imdbRating !== "N/A" ? omdbData.imdbRating : "";

        language = omdbData.Language !== "N/A" ? omdbData.Language : "";

        country = omdbData.Country !== "N/A" ? omdbData.Country : "";
        seasons = omdbData.totalSeasons !== "N/A" ? omdbData.totalSeasons : "";
      }
    }

    res.json({
      ...data,
      media_type: type,
      title: data.title || data.name,
      release_date: data.release_date || data.first_air_date,

      runtime: type === "movie" ? data.runtime : "",

      seasons: type === "tv" ? data.number_of_seasons : "",

      imdb_rating: imdbRating,
      language,
      country,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch media details",
    });
  }
});


// start server
async function startServer() {
  await connectToMongoDB();

  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}

startServer();
