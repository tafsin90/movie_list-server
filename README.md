FRAME - MOVIE COLLECTION SERVER
================================

ABOUT
-----
This repository contains the Express API for FRAME, a movie, series, and
anime collection manager. It provides endpoints used by the Next.js client
for media collections, search, statistics, and franchise management. It
also retrieves title information from TMDB and IMDb ratings from OMDb.

PROJECT LINKS
-------------
- Client GitHub: https://github.com/tafsin90/movie_list-client
- Server GitHub: https://github.com/tafsin90/movie_list-server
- Live application: https://frame-collection.vercel.app/

TECHNOLOGIES
------------
- Node.js and Express 5
- MongoDB Node.js driver
- dotenv for local environment variables
- cors for cross-origin API requests
- TMDB API for title search and metadata
- OMDb API for IMDb ratings when available

HOW IT WORKS
------------
1. The client sends HTTP requests to this API.
2. The API reads and writes data in the MongoDB database named "Your_Database_Name".
3. Media records are stored in the "media" collection; franchise folders
   and their media associations are stored in "franchises" and
   "franchiseItems".
4. The server creates MongoDB indexes when it connects.
5. TMDB and OMDb credentials are used by the server only and must not be
   placed in client-side environment variables.

API OVERVIEW
------------
Media:
- POST /api/media                         Add a media record
- GET  /api/media/collection/:userId/:status
                                            List a user's watchlist or
                                            finished collection; supports
                                            paging, search, filters, sorting
- GET  /api/media/search?query=...         Search TMDB
- GET  /api/media/:type/:id                Get TMDB details and ratings
- GET  /api/media/stats/:userId            Get collection statistics
- GET  /api/allmedia/collection/:userId    Get the user's full archive
- GET  /api/media/search-collection        Search the user's own collection
- PUT  /api/editmedia/:id                  Update a media record
- DELETE /api/media/delete/:id/:userId     Delete a media record

Franchises:
- /api/franchise-folders                   Create and manage folders
- /api/franchise-folders/user/:userId      List a user's folders
- /api/franchise-folders/:id               Read, update, or delete a folder
- /api/franchise-folders/:id/items         Add or remove associated media
- /api/franchise-folders/:id/order         Save a custom media order

LOCAL SETUP
-----------
Requirements:
- Node.js 22 LTS (or a newer version supported by the MongoDB driver)
- npm
- MongoDB running locally or a MongoDB Atlas connection string
- A TMDB Read Access Token
- Optional: an OMDb API key for IMDb ratings

Credential providers:
- MongoDB Atlas: https://www.mongodb.com/atlas
- TMDB API settings: https://www.themoviedb.org/settings/api
- OMDb API key: https://www.omdbapi.com/apikey.aspx

The client and server are separate repositories. Clone the server from a
parent folder:

   git clone https://github.com/tafsin90/movie_list-server.git

The client must also be cloned and run separately; see the client README.
Use the same MongoDB connection string in both apps. The server uses the
database named "Frame".

1. Open a terminal in the parent folder and enter the server folder. Copy
   .env.example to .env:

   Windows PowerShell:
   - cd movie_list-server
   - Copy-Item .env.example .env

   macOS/Linux:
   - cd movie_list-server
   - cp .env.example .env

   If .env already exists, do not overwrite it. Add any missing settings
   from .env.example to the existing file.

2. Edit .env and set:
   - MONGO_URI to a local or Atlas MongoDB connection string.
   - TMDB_ACCESS_TOKEN to a TMDB Read Access Token.
   - OMDB_API_KEY if IMDb ratings are desired.
   - PORT only if you do not want the default port 5000.

   For MongoDB Atlas, create a database user and allow the local machine's
   IP address in the Atlas network access settings. URL-encode special
   characters in the database username or password.

3. Install server dependencies:

   - npm install

4. Start the API:

   - node index.js

The server connects to MongoDB, creates its indexes, then starts listening
on http://localhost:5000 (unless PORT is set to another value).

ENVIRONMENT FILES AND SECRETS
-----------------------------
.env.example is a safe template intended for GitHub. Copy it to .env and
replace its example values for local development. Never commit .env,
database credentials, or API tokens.

CLIENT CONFIGURATION
--------------------
For local development, set this in the client's .env.local:

   NEXT_PUBLIC_SERVER_URL=http://localhost:5000

For production, set it to the deployed API base URL. Do not put database
credentials or external API tokens in NEXT_PUBLIC_* variables.

PRODUCTION NOTES
----------------
- Configure MONGO_URI, TMDB_ACCESS_TOKEN, OMDB_API_KEY, and PORT in the
  server hosting environment.
- Configure CORS appropriately for the deployed client origin.
- Never commit .env files, database credentials, or API tokens.
- The server package currently does not define a test script.

PROJECT STRUCTURE
-----------------
index.js          Express application, MongoDB setup, indexes, and API routes
package.json      Server dependencies

The Next.js UI and client setup instructions are maintained in the
Movie_List-client repository.
