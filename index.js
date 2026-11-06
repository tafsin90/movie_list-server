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

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/api/movies/search", async (req, res) => {
  try {
    const query = req.query.query;

    if (!query) {
      return res.status(400).json({
        error: "Movie name is required",
      });
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}`,
      {
        method: "GET",
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

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Something went wrong",
    });
  }
});
app.get("/api/movies/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get movie details from TMDB
    const response = await fetch(`https://api.themoviedb.org/3/movie/${id}`, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        message: "Failed to fetch movie details from TMDB",
      });
    }

    const data = await response.json();
    console.log("TMDB--->", data);

    // Get IMDb rating using IMDb ID
    let imdbRating = "";
    let language = "";
    let country = "";
    if (data.imdb_id && process.env.OMDB_API_KEY) {
      const omdbResponse = await fetch(
        `https://www.omdbapi.com/?i=${data.imdb_id}&apikey=${process.env.OMDB_API_KEY}`,
      );

      const omdbData = await omdbResponse.json();
      console.log("OMDB-->", omdbData);

      if (omdbData.Response === "True") {
        imdbRating = omdbData.imdbRating !== "N/A" ? omdbData.imdbRating : "";

        language = omdbData.Language !== "N/A" ? omdbData.Language : "";

        country = omdbData.Country !== "N/A" ? omdbData.Country : "";
      }
    }

    // Return combined data
    res.json({
      ...data,
      imdb_rating: imdbRating,
      language,
      country,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch movie details",
    });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
