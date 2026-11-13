const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGO_URI);

let db;
let mediaCollection;
let franchisesCollection;
let franchiseItemsCollection;

// ==========================================
// MONGODB CONNECTION
// ==========================================

async function connectToMongoDB() {
  await client.connect();

  db = client.db("Frame");

  mediaCollection = db.collection("media");
  franchisesCollection = db.collection("franchises");
  franchiseItemsCollection = db.collection("franchiseItems");

  // ==========================================
  // MEDIA INDEXES
  // ==========================================

  await mediaCollection.createIndex({
    userId: 1,
    status: 1,
    statusChangedAt: -1,
  });

  await mediaCollection.createIndex({
    userId: 1,
    createdAt: -1,
  });

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

  // ==========================================
  // FRANCHISE INDEXES
  // ==========================================

  await franchisesCollection.createIndex(
    {
      userId: 1,
      name: 1,
    },
    {
      unique: true,
    },
  );

  await franchisesCollection.createIndex({
    userId: 1,
    createdAt: -1,
  });

  await franchisesCollection.createIndex({
    userId: 1,
    parentId: 1,
    createdAt: -1,
  });
  // ==========================================
  // FRANCHISE ITEMS INDEXES
  // ==========================================

  await franchiseItemsCollection.createIndex(
    {
      userId: 1,
      franchiseId: 1,
      mediaId: 1,
    },
    {
      unique: true,
    },
  );

  await franchiseItemsCollection.createIndex({
    userId: 1,
    franchiseId: 1,
    order: 1,
  });

  await franchiseItemsCollection.createIndex({
    userId: 1,
    mediaId: 1,
  });

  console.log("You successfully connected to MongoDB!");

  // ==========================================
  // FRANCHISE APIs
  // ==========================================

  // CREATE FRANCHISE OR SUBCOLLECTION
  app.post("/api/franchise-folders", async (req, res) => {
    try {
      const { userId, name, poster, description, parentId } = req.body;

      if (!userId || !name?.trim()) {
        return res.status(400).json({
          message: "User ID and franchise name are required",
        });
      }

      let parentObjectId = null;
      let level = 0;

      // CREATE SUBCOLLECTION IF parentId IS PROVIDED
      if (parentId) {
        if (!ObjectId.isValid(parentId)) {
          return res.status(400).json({
            message: "Invalid parent franchise ID",
          });
        }

        parentObjectId = new ObjectId(parentId);

        const parent = await franchisesCollection.findOne({
          _id: parentObjectId,
          userId,
          parentId: null,
        });

        if (!parent) {
          return res.status(404).json({
            message: "Parent franchise not found",
          });
        }

        level = 1;
      }

      const franchise = {
        userId,
        name: name.trim(),
        poster: poster?.trim() || "",
        description: description?.trim() || "",
        parentId: parentObjectId,
        level,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await franchisesCollection.insertOne(franchise);

      res.status(201).json({
        message:
          level === 0
            ? "Franchise created successfully"
            : "Subcollection created successfully",
        franchiseId: result.insertedId,
      });
    } catch (error) {
      console.error("Create franchise error:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          message: "A franchise with this name already exists",
        });
      }

      res.status(500).json({
        message: "Failed to create franchise",
      });
    }
  });

  // GET ALL USER PARENT FRANCHISES
  app.get("/api/franchise-folders/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;

      const franchises = await franchisesCollection
        .aggregate([
          {
            $match: {
              userId,
              parentId: null,
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
          {
            $lookup: {
              from: "franchises",
              let: {
                parentId: "$_id",
                currentUser: "$userId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$parentId", "$$parentId"] },
                        { $eq: ["$userId", "$$currentUser"] },
                      ],
                    },
                  },
                },
                {
                  $count: "count",
                },
              ],
              as: "subcollectionCount",
            },
          },
          {
            $addFields: {
              subcollectionCount: {
                $ifNull: [
                  { $arrayElemAt: ["$subcollectionCount.count", 0] },
                  0,
                ],
              },
            },
          },
        ])
        .toArray();

      res.json(franchises);
    } catch (error) {
      console.error("Get franchises error:", error);

      res.status(500).json({
        message: "Failed to fetch franchises",
      });
    }
  });

  // GET SINGLE FRANCHISE OR SUBCOLLECTION
  app.get("/api/franchise-folders/:franchiseId", async (req, res) => {
    try {
      const { franchiseId } = req.params;
      const { userId } = req.query;

      if (!ObjectId.isValid(franchiseId) || !userId) {
        return res.status(400).json({
          message: "Invalid franchise ID or missing user ID",
        });
      }

      const franchise = await franchisesCollection.findOne({
        _id: new ObjectId(franchiseId),
        userId,
      });

      if (!franchise) {
        return res.status(404).json({
          message: "Franchise not found",
        });
      }

      // GET CHILDREN ONLY FOR PARENT FRANCHISES
      let children = [];

      if (franchise.parentId == null) {
        children = await franchisesCollection
          .find({
            userId,
            parentId: franchise._id,
          })
          .sort({ createdAt: -1 })
          .toArray();
      }

      // GET MEDIA BELONGING TO THIS FRANCHISE
      const items = await franchiseItemsCollection
        .aggregate([
          {
            $match: {
              franchiseId: franchise._id,
              userId,
            },
          },
          {
            $sort: {
              order: 1,
              _id: 1,
            },
          },
          {
            $lookup: {
              from: "media",
              let: {
                mediaId: "$mediaId",
                currentUser: "$userId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$_id", "$$mediaId"] },
                        { $eq: ["$userId", "$$currentUser"] },
                      ],
                    },
                  },
                },
              ],
              as: "media",
            },
          },
          {
            $unwind: "$media",
          },
          {
            $project: {
              _id: 1,
              order: 1,
              addedAt: 1,
              media: "$media",
            },
          },
        ])
        .toArray();

      res.json({
        franchise,
        children,
        items,
      });
    } catch (error) {
      console.error("Get franchise details error:", error);

      res.status(500).json({
        message: "Failed to fetch franchise details",
      });
    }
  });

  // UPDATE FRANCHISE
  app.put("/api/franchise-folders/:franchiseId", async (req, res) => {
    try {
      const { franchiseId } = req.params;
      const { userId, name, poster, description } = req.body;

      if (!ObjectId.isValid(franchiseId) || !userId || !name?.trim()) {
        return res.status(400).json({
          message: "Invalid information",
        });
      }

      const result = await franchisesCollection.updateOne(
        {
          _id: new ObjectId(franchiseId),
          userId,
        },
        {
          $set: {
            name: name.trim(),
            poster: poster?.trim() || "",
            description: description?.trim() || "",
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          message: "Franchise not found",
        });
      }

      res.json({
        message: "Franchise updated successfully",
      });
    } catch (error) {
      console.error("Update franchise error:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          message: "A franchise with this name already exists",
        });
      }

      res.status(500).json({
        message: "Failed to update franchise",
      });
    }
  });

  // DELETE FRANCHISE OR SUBCOLLECTION
  app.delete("/api/franchise-folders/:franchiseId", async (req, res) => {
    try {
      const { franchiseId } = req.params;
      const { userId } = req.query;

      if (!ObjectId.isValid(franchiseId) || !userId) {
        return res.status(400).json({
          message: "Invalid information",
        });
      }

      const franchiseObjectId = new ObjectId(franchiseId);

      const franchise = await franchisesCollection.findOne({
        _id: franchiseObjectId,
        userId,
      });

      if (!franchise) {
        return res.status(404).json({
          message: "Franchise not found",
        });
      }

      // FIND CHILDREN IF THIS IS A PARENT
      let franchiseIds = [franchiseObjectId];

      if (franchise.parentId == null) {
        const children = await franchisesCollection
          .find({
            userId,
            parentId: franchiseObjectId,
          })
          .project({ _id: 1 })
          .toArray();

        franchiseIds = [
          franchiseObjectId,
          ...children.map((child) => child._id),
        ];

        // DELETE CHILD DOCUMENTS
        await franchisesCollection.deleteMany({
          userId,
          parentId: franchiseObjectId,
        });
      }

      // DELETE RELATIONSHIPS ONLY
      await franchiseItemsCollection.deleteMany({
        userId,
        franchiseId: { $in: franchiseIds },
      });

      // DELETE REQUESTED FRANCHISE
      await franchisesCollection.deleteOne({
        _id: franchiseObjectId,
        userId,
      });

      res.json({
        message: "Franchise deleted successfully",
      });
    } catch (error) {
      console.error("Delete franchise error:", error);

      res.status(500).json({
        message: "Failed to delete franchise",
      });
    }
  });

  // ADD MEDIA TO FRANCHISE
  app.post("/api/franchise-folders/:franchiseId/items", async (req, res) => {
    try {
      const { franchiseId } = req.params;
      const { userId, mediaId } = req.body;

      if (
        !ObjectId.isValid(franchiseId) ||
        !ObjectId.isValid(mediaId) ||
        !userId
      ) {
        return res.status(400).json({
          message: "Invalid information",
        });
      }

      const franchiseObjectId = new ObjectId(franchiseId);
      const mediaObjectId = new ObjectId(mediaId);

      // CHECK FRANCHISE
      const franchise = await franchisesCollection.findOne({
        _id: franchiseObjectId,
        userId,
      });

      if (!franchise) {
        return res.status(404).json({
          message: "Franchise not found",
        });
      }

      // CHECK MEDIA
      const media = await mediaCollection.findOne({
        _id: mediaObjectId,
        userId,
      });

      if (!media) {
        return res.status(404).json({
          message: "Media not found",
        });
      }

      if (!["watchlist", "finished"].includes(media.status)) {
        return res.status(400).json({
          message: "Only Watchlist and Finished media can be added",
        });
      }

      // CHECK DUPLICATE
      const existingItem = await franchiseItemsCollection.findOne({
        userId,
        franchiseId: franchiseObjectId,
        mediaId: mediaObjectId,
      });

      if (existingItem) {
        return res.status(409).json({
          message: "This media is already in the franchise",
        });
      }

      // FIND LAST ORDER
      const lastItem = await franchiseItemsCollection.findOne(
        {
          userId,
          franchiseId: franchiseObjectId,
        },
        {
          sort: { order: -1 },
        },
      );

      const nextOrder = lastItem ? lastItem.order + 1 : 1;

      // INSERT RELATIONSHIP
      await franchiseItemsCollection.insertOne({
        userId,
        franchiseId: franchiseObjectId,
        mediaId: mediaObjectId,
        order: nextOrder,
        addedAt: new Date(),
      });

      res.status(201).json({
        message: "Media added to franchise successfully",
      });
    } catch (error) {
      console.error("Add franchise media error:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          message: "This media is already in the franchise",
        });
      }

      res.status(500).json({
        message: "Failed to add media",
      });
    }
  });

  // REMOVE MEDIA FROM FRANCHISE
  app.delete(
    "/api/franchise-folders/:franchiseId/items/:mediaId",
    async (req, res) => {
      try {
        const { franchiseId, mediaId } = req.params;
        const { userId } = req.query;

        if (
          !ObjectId.isValid(franchiseId) ||
          !ObjectId.isValid(mediaId) ||
          !userId
        ) {
          return res.status(400).json({
            message: "Invalid information",
          });
        }

        const result = await franchiseItemsCollection.deleteOne({
          userId,
          franchiseId: new ObjectId(franchiseId),
          mediaId: new ObjectId(mediaId),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            message: "Franchise item not found",
          });
        }

        res.json({
          message: "Media removed from franchise successfully",
        });
      } catch (error) {
        console.error("Remove franchise media error:", error);

        res.status(500).json({
          message: "Failed to remove media",
        });
      }
    },
  );

  // UPDATE CUSTOM ORDER
  app.put("/api/franchise-folders/:franchiseId/order", async (req, res) => {
    try {
      const { franchiseId } = req.params;
      const { userId, mediaIds } = req.body;

      if (
        !ObjectId.isValid(franchiseId) ||
        !userId ||
        !Array.isArray(mediaIds) ||
        !mediaIds.every((id) => ObjectId.isValid(id))
      ) {
        return res.status(400).json({
          message: "Invalid ordering information",
        });
      }

      const franchiseObjectId = new ObjectId(franchiseId);

      const franchise = await franchisesCollection.findOne({
        _id: franchiseObjectId,
        userId,
      });

      if (!franchise) {
        return res.status(404).json({
          message: "Franchise not found",
        });
      }

      if (new Set(mediaIds).size !== mediaIds.length) {
        return res.status(400).json({
          message: "Duplicate media IDs are not allowed",
        });
      }

      const existingItems = await franchiseItemsCollection
        .find({
          userId,
          franchiseId: franchiseObjectId,
        })
        .toArray();

      const existingIds = existingItems
        .map((item) => item.mediaId.toString())
        .sort();

      const submittedIds = [...mediaIds].sort();

      if (JSON.stringify(existingIds) !== JSON.stringify(submittedIds)) {
        return res.status(400).json({
          message: "Submitted media list does not match franchise items",
        });
      }

      const operations = mediaIds.map((mediaId, index) => ({
        updateOne: {
          filter: {
            userId,
            franchiseId: franchiseObjectId,
            mediaId: new ObjectId(mediaId),
          },
          update: {
            $set: {
              order: index + 1,
            },
          },
        },
      }));

      if (operations.length > 0) {
        await franchiseItemsCollection.bulkWrite(operations);
      }

      res.json({
        message: "Collection order updated successfully",
      });
    } catch (error) {
      console.error("Update franchise order error:", error);

      res.status(500).json({
        message: "Failed to update collection order",
      });
    }
  });


  // ==========================================
  // MEDIA APIs
  // ==========================================

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
        tmdbId,
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
        tmdbId,
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

      if (error.code === 11000) {
        return res.status(409).json({
          message: "This media is already in your collection",
        });
      }

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

      if (!query?.trim()) {
        return res.json({
          results: [],
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
          message: data.status_message || "TMDB search failed",
        });
      }

      const results = (data.results || []).filter(
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

  // NAV SEARCH
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

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          message: data.status_message || "Failed to fetch TMDB details",
        });
      }

      const imdbId = type === "tv" ? data.external_ids?.imdb_id : data.imdb_id;

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
        tmdb_id: String(data.id),
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

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const sortOptions = {
        recent: { statusChangedAt: -1, _id: -1 },
        title: { title: 1, _id: 1 },
        rating: { imdbRating: -1, _id: -1 },
        newest: { releaseDate: -1, _id: -1 },
      };

      const sort = sortOptions[req.query.sort] || sortOptions.recent;

      const filter = { userId, status };

      if (req.query.category && req.query.category !== "All") {
        filter.category = req.query.category;
      }

      if (req.query.search?.trim()) {
        filter.title = {
          $regex: req.query.search
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        };
      }

      const totalItems = await mediaCollection.countDocuments(filter);

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

      const existingMedia = await mediaCollection.findOne({
        _id: new ObjectId(id),
        userId,
      });

      if (!existingMedia) {
        return res.status(404).json({
          message: "Media not found",
        });
      }

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

      const mediaObjectId = new ObjectId(id);

      const result = await mediaCollection.deleteOne({
        _id: mediaObjectId,
        userId,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          message: "Media not found",
        });
      }

      // Remove this media from all franchise folders.
      // This does not affect any other media.
      await franchiseItemsCollection.deleteMany({
        mediaId: mediaObjectId,
        userId,
      });

      res.status(200).json({
        message: "Media deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting media:", error);

      res.status(500).json({
        message: "Failed to delete media",
      });
    }
  });

  // ==========================================
  // HOME
  // ==========================================

  app.get("/", (req, res) => {
    res.send("FRAME API Server is running!");
  });
}

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  try {
    await connectToMongoDB();

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);

    await client.close().catch(() => {});

    process.exit(1);
  }
}

startServer();
