const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");

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
    // await client.connect();

    db = client.db("Frame");
    mediaCollection = db.collection("media");

    // Collection queries
    await mediaCollection.createIndex({
      userId: 1,
      status: 1,
      statusChangedAt: -1,
    });

    // All media queries
    await mediaCollection.createIndex({
      userId: 1,
      createdAt: -1,
    });

    // no duplicate
    await mediaCollection.createIndex(
      {
        userId: 1,
        mediaType: 1,
        tmdbId: 1,
      },
      {
        unique: true,
        partialFilterExpression: {
          tmdbId: { $type: "string" },
        },
      },
    );

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
          statusChangedAt: new Date(),
          createdAt: new Date(),
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
    app.get("/api/media/stats/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const [watchlistCount, finishedCount] = await Promise.all([
          mediaCollection.countDocuments({
            userId,
            status: "watchlist",
          }),

          mediaCollection.countDocuments({
            userId,
            status: "finished",
          }),
        ]);

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

    // SEARCH MEDIA USING TMDB
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
        console.error("TMDB search error:", error);

        res.status(500).json({
          error: "Something went wrong",
        });
      }
    });

    // nav search
    app.get("/api/media/search-collection", async (req, res) => {
      try {
        const { userId, search } = req.query;

        if (!search?.trim()) {
          return res.json([]);
        }

        const results = await mediaCollection
          .find({
            userId,
            title: {
              $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              $options: "i",
            },
          })
          .project({
            title: 1,
            poster: 1,
            category: 1,
            status: 1,
          })
          .limit(8)
          .toArray();

        res.json(results);
      } catch (error) {
        console.error(error);
        res.status(500).json({
          message: "Search failed",
        });
      }
    });

    // GET MEDIA DETAILS FROM TMDB
    app.get("/api/media/:type/:id", async (req, res) => {
      try {
        const { type, id } = req.params;

        // Fetch details from TMDB
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

            if (omdbData.Response === "True" && omdbData.imdbRating !== "N/A") {
              imdbRating = omdbData.imdbRating;
            }
          } catch (error) {
            console.error("OMDb request failed:", error);
          }
        } else {
          console.log("IMDb ID or OMDb API key is missing.");
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

    // GET USER MEDIA WITH PAGINATION
    app.get("/api/media/collection/:userId/:status", async (req, res) => {
      try {
        const { userId, status } = req.params;

        // Pagination
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

        const skip = (page - 1) * limit;

        // Sorting
        const sortOptions = {
          recent: { statusChangedAt: -1, _id: -1 },
          title: { title: 1, _id: 1 },
          rating: { imdbRating: -1, _id: -1 },
          newest: { releaseDate: -1, _id: -1 },
        };

        const sort = sortOptions[req.query.sort] || sortOptions.recent;

        // Filtering
        const filter = { userId, status };

        if (req.query.category && req.query.category !== "All") {
          filter.category = req.query.category;
        }

        // Search
        if (req.query.search?.trim()) {
          filter.title = {
            $regex: req.query.search
              .trim()
              .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          };
        }

        // Get total matching documents
        const totalItems = await mediaCollection.countDocuments(filter);

        // Get only requested documents
        const items = await mediaCollection
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.json({
          items,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems,
            limit,
          },
        });
      } catch (error) {
        console.error("Error fetching collection:", error);

        res.status(500).json({
          message: "Failed to fetch media",
        });
      }
    });

    // GET ALL MEDIA BELONGING TO A USER
    app.get("/api/allmedia/collection/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const media = await mediaCollection
          .find({ userId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json(media);
      } catch (error) {
        console.error("Error fetching collection:", error);

        res.status(500).json({
          message: "Failed to fetch media",
        });
      }
    });

    // GET MEDIA FOR EDITING
    app.get("/api/editmedia/:id/:userId", async (req, res) => {
      try {
        const { id, userId } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            message: "Invalid media ID",
          });
        }

        const media = await mediaCollection.findOne({
          _id: new ObjectId(id),
          userId,
        });

        if (!media) {
          return res.status(404).json({
            message: "Media not found",
          });
        }

        res.status(200).json(media);
      } catch (error) {
        console.error("Error fetching media for editing:", error);

        res.status(500).json({
          message: "Failed to fetch media",
        });
      }
    });

    // UPDATE EXISTING MEDIA
    app.put("/api/editmedia/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const {
          userId,
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

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            message: "Invalid media ID",
          });
        }

        if (!userId) {
          return res.status(400).json({
            message: "User ID is required",
          });
        }

        if (!["watchlist", "finished"].includes(status)) {
          return res.status(400).json({
            message: "Invalid media status",
          });
        }

        // Find the existing media
        const existingMedia = await mediaCollection.findOne({
          _id: new ObjectId(id),
          userId,
        });

        if (!existingMedia) {
          return res.status(404).json({
            message: "Media not found",
          });
        }

        // Prepare updated media
        const updatedMedia = {
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

        // Update timestamp only when status changes
        if (existingMedia.status !== status) {
          updatedMedia.statusChangedAt = new Date();
        }

        const result = await mediaCollection.updateOne(
          {
            _id: new ObjectId(id),
            userId,
          },
          {
            $set: updatedMedia,
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            message: "Media not found",
          });
        }

        res.status(200).json({
          message: "Media updated successfully",
        });
      } catch (error) {
        console.error("Error updating media:", error);

        res.status(500).json({
          message: "Failed to update media",
        });
      }
    });

    // DELETE MEDIA
    app.delete("/api/media/delete/:id/:userId", async (req, res) => {
      try {
        const { id, userId } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            message: "Invalid media ID",
          });
        }

        if (!userId) {
          return res.status(400).json({
            message: "User ID is required",
          });
        }

        const result = await mediaCollection.deleteOne({
          _id: new ObjectId(id),
          userId,
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            message: "Media not found",
          });
        }

        res.status(200).json({
          message: "Media deleted successfully",
        });
      } catch (error) {
        res.status(500).json({
          message: "Failed to delete media",
        });
      }
    });
    // HOME
    app.get("/", (req, res) => {
      res.send("FRAME API Server is running!");
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
