import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MV MARKETS by OceanX",
    short_name: "MV Markets",
    description: "Buy and sell across the Maldives.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#03060d",
    theme_color: "#0f172a",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Post a listing", short_name: "Sell", url: "/sell", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "All items", short_name: "Browse", url: "/search", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Messages", short_name: "Chats", url: "/messages", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
