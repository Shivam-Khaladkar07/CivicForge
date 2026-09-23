const rawApiOrigin = process.env.CIVICFORGE_API_ORIGIN;
if (!rawApiOrigin) {
  throw new Error("Set CIVICFORGE_API_ORIGIN to the deployed CivicForge API HTTPS origin before deploying the frontend.");
}

let apiOrigin;
try {
  const parsed = new URL(rawApiOrigin);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Expected an HTTPS origin without a path, credentials, query, or fragment.");
  }
  apiOrigin = parsed.origin;
} catch {
  throw new Error("CIVICFORGE_API_ORIGIN must be a valid HTTPS origin, such as https://api.example.org.");
}

export const config = {
  framework: "vite",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  headers: [{
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:" },
    ],
  }],
  rewrites: [
    { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
    { source: "/(.*)", destination: "/index.html" },
  ],
};
