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

    // ADD MEDIA
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

        const media = {
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
        };

        const result = await mediaCollection.insertOne(media);

        res.status(201).json({
          message: "Media added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({
          message: "Failed to add media",
        });
      }
    });

    // GET USER STATISTICS
    app.get("/api/media/stats/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const watchlistCount = await mediaCollection.countDocuments({
          userId: userId,
          status: "watchlist",
        });

        const finishedCount = await mediaCollection.countDocuments({
          userId: userId,
          status: "finished",
        });

        res.json({
          watchlist: watchlistCount,
          finished: finishedCount,
        });
      } catch (error) {
        res.status(500).json({
          message: "Failed to fetch statistics",
        });
      }
    });

    // SEARCH MEDIA using TMDB
    app.get("/api/media/search", async (req, res) => {
      try {
        const { query } = req.query;

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

        // Only return movies and TV series
        const results = data.results.filter(
          (item) => item.media_type === "movie" || item.media_type === "tv",
        );

        res.json({
          ...data,
          results,
        });
      } catch (error) {
        res.status(500).json({
          error: "Something went wrong",
        });
      }
    });

    // GET MEDIA DETAILS
    app.get("/api/media/:type/:id", async (req, res) => {
      try {
        const { type, id } = req.params;
        // Fetch details from TMDB
        // external_ids provides IMDb ID for TV series
        const response = await fetch(
          `https://api.themoviedb.org/3/${type}/${id}?append_to_response=external_ids`,
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
            message: data.status_message || "Failed to fetch TMDB details",
          });
        }

        // Get IMDb ID
        const imdbId =
          type === "tv" ? data.external_ids?.imdb_id : data.imdb_id;

        // Get IMDb rating from OMDb
        let imdbRating = "";

        if (imdbId && process.env.OMDB_API_KEY) {
          try {
            const omdbResponse = await fetch(
              `https://www.omdbapi.com/?i=${imdbId}&apikey=${process.env.OMDB_API_KEY}`,
            );

            const omdbData = await omdbResponse.json();

            // console.log("OMDb Response:", omdbData);

            if (omdbData.Response === "True" && omdbData.imdbRating !== "N/A") {
              imdbRating = omdbData.imdbRating;
            }
          } catch (error) {
            console.error("OMDb request failed:", error);
          }
        } else {
          console.log("IMDb ID or OMDb API key is missing.");
        }

        // console.log("Final IMDb Rating:", imdbRating);

        // Prepare details for the frontend form
        const mediaDetails = {
          title: data.title || data.name || "",
          poster_path: data.poster_path || "",
          overview: data.overview || "",
          release_date: data.release_date || data.first_air_date || "",
          imdb_rating: imdbRating,
          runtime: data.runtime || "",
          seasons: data.number_of_seasons || "",
          language:
            data.spoken_languages
              ?.map((language) => language.english_name)
              .join(", ") || "",
          country:
            data.production_countries
              ?.map((country) => country.name)
              .join(", ") || "",
          media_type: type,
          genres: data.genres || [],
        };

        res.json(mediaDetails);
      } catch (error) {
        console.error("Error fetching media details:", error);

        res.status(500).json({
          message: "Failed to fetch media details",
        });
      }
    });

    // GET MEDIAby User and Status
    app.get("/api/media/collection/:userId/:status", async (req, res) => {
      try {
        const { userId, status } = req.params;

        const media = await mediaCollection
          .find({ userId, status })
          .sort({ createdAt: -1 })
          .toArray();

        res.json(media);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch media" });
      }
    });

    return client;
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

async function startServer() {
  await connectToMongoDB();

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

startServer();
