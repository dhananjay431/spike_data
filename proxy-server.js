const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const NSE_API_URL =
  "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050";

// Store session cookies from NSE
let nseCookies = "";

/**
 * Fetch NSE home page first to get session cookies, then call the API.
 */
function getNSECookies() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "www.nseindia.com",
      path: "/",
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    };

    const req = https.request(options, (res) => {
      const setCookie = res.headers["set-cookie"];
      if (setCookie) {
        nseCookies = setCookie.map((c) => c.split(";")[0]).join("; ");
        // Also store from all response headers
      }
      // Consume response body
      res.resume();
      res.on("end", () => {
        resolve(nseCookies);
      });
    });

    req.on("error", (err) => {
      console.error("Cookie fetch error:", err.message);
      resolve(nseCookies); // Resolve with whatever we have
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve(nseCookies);
    });

    req.end();
  });
}

/**
 * Call the NSE equity stock indices API with stored cookies.
 */
function fetchNSEAPI() {
  return new Promise((resolve, reject) => {
    const url = new URL(NSE_API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: "https://www.nseindia.com/",
        Cookie: nseCookies,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error("Failed to parse NSE response: " + e.message));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error("NSE API request failed: " + err.message));
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("NSE API request timed out"));
    });

    req.end();
  });
}

/**
 * Create HTTP server that proxies NSE API calls with CORS support.
 */
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route: /api/nifty50
  if (req.url === "/api/nifty50") {
    try {
      // Refresh cookies if empty or stale
      if (!nseCookies) {
        console.log("Fetching fresh NSE session cookies...");
        await getNSECookies();
      }

      console.log("Fetching NSE NIFTY 50 data...");
      let data;
      try {
        data = await fetchNSEAPI();
      } catch (apiErr) {
        // If cookies are stale, refresh and retry once
        console.log("Retrying with fresh cookies...");
        await getNSECookies();
        data = await fetchNSEAPI();
      }

      console.log("Data fetched successfully");
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error("Proxy error:", err.message);
      res.writeHead(502, {"Content-Type": "application/json"});
      res.end(
        JSON.stringify({
          error: "Failed to fetch NSE data",
          message: err.message,
        }),
      );
    }
    return;
  }

  // Serve static HTML files
  if (req.url === "/" || req.url === "/index.html") {
    const filePath = path.join(__dirname, "index.html");
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {"Content-Type": "text/html"});
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404, {"Content-Type": "text/plain"});
      res.end("index.html not found");
    }
    return;
  }

  if (req.url === "/index2.html") {
    const filePath = path.join(__dirname, "index2.html");
    if (fs.existsSync(filePath)) {
      res.writeHead(200, {"Content-Type": "text/html"});
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404, {"Content-Type": "text/plain"});
      res.end("index2.html not found");
    }
    return;
  }

  res.writeHead(404, {"Content-Type": "text/plain"});
  res.end("Not Found. Use /api/nifty50");
});

// Refresh cookies every 30 minutes
setInterval(
  async () => {
    console.log("Auto-refreshing NSE session cookies...");
    try {
      await getNSECookies();
      console.log("Cookies refreshed.");
    } catch (e) {
      console.error("Cookie refresh failed:", e.message);
    }
  },
  30 * 60 * 1000,
);

server.listen(PORT, async () => {
  console.log(`NSE Proxy Server running at http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/nifty50`);
  console.log(`Dashboard v1: http://localhost:${PORT}/`);
  console.log(`Dashboard v2: http://localhost:${PORT}/index2.html`);
  console.log("Fetching initial NSE session cookies...");
  try {
    await getNSECookies();
    console.log("Initial cookies acquired. Ready to serve requests.");
  } catch (e) {
    console.error("Initial cookie fetch failed:", e.message);
    console.log("Will retry on first API request.");
  }
});
