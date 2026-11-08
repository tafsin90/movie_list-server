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
        console.error("Error adding media:", error);

        res.status(500).json({
          message: "Failed to add media",
        });
      }
    });

    // GET USER STATISTICS
    // IMPORTANT: Keep this route ABOVE /api/media/:type/:id
    app.get("/api/media/stats/:userId", async (req, res) => {
      try {
        // console.log("Statistics route reached!");

        const { userId } = req.params;

        // console.log("Requested User ID:", userId);

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
        console.error("Error fetching statistics:", error);

        res.status(500).json({
          message: "Failed to fetch statistics",
        });
      }
    });

    // SEARCH MEDIA
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

        // Only return movies and TV series
        const results = data.results.filter(
          (item) => item.media_type === "movie" || item.media_type === "tv",
        );

        res.json({
          ...data,
          results,
        });
      } catch (error) {
        console.error("TMDB search error:", error);

        res.status(500).json({
          error: "Something went wrong",
        });
      }
    });

    // GET MEDIA DETAILS
    // Keep this route BELOW the more specific routes.
    app.get("/api/media/:type/:id", async (req, res) => {
      try {
        const { type, id } = req.params;

        if (!["movie", "tv"].includes(type)) {
          return res.status(400).json({
            message: "Invalid media type",
          });
        }

        // Fetch details from TMDB
        const response = await fetch(
          `https://api.themoviedb.org/3/${type}/${id}`,
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

        // Get IMDb rating from OMDb
        let imdbRating = "";

        if (data.imdb_id && process.env.OMDB_API_KEY) {
          const omdbResponse = await fetch(
            `https://www.omdbapi.com/?i=${data.imdb_id}&apikey=${process.env.OMDB_API_KEY}`,
          );

          const omdbData = await omdbResponse.json();

          if (omdbData.Response === "True" && omdbData.imdbRating !== "N/A") {
            imdbRating = omdbData.imdbRating;
          }
        }

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
