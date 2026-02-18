import dotenv from "dotenv";
dotenv.config();
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/index.html"))
);
app.get("/:slug", (req, res) =>
  res.sendFile(path.join(__dirname, "public/pad.html"))
);

// ---------- MongoDB ----------
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("Missing MONGODB_URI env var");

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

const padSchema = new mongoose.Schema(
  {
    slug: { type: String, unique: true, index: true },
    text: { type: String, default: "" },
  },
  { timestamps: true } // gives updatedAt
);

// ✅ 24-hour auto delete
padSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

const Pad = mongoose.model("Pad", padSchema);

// ---------- RAM cache ----------
const pads = new Map(); // slug -> { text, t }
const MAX_PADS = 600;

// ---------- Batched DB saves ----------
const pending = new Map(); // slug -> { text, timer }
function scheduleSave(slug, text) {
  const existing = pending.get(slug);
  if (existing?.timer) clearTimeout(existing.timer);

  const timer = setTimeout(async () => {
    try {
      await Pad.updateOne({ slug }, { $set: { text } }, { upsert: true });
    } catch (e) {
      console.error("Mongo save failed:", e?.message || e);
    } finally {
      pending.delete(slug);
    }
  }, 1000);

  pending.set(slug, { text, timer });
}

// ---------- Anti-spam ----------
const lastEditAt = new Map(); // socket.id -> timestamp

io.on("connection", async (s) => {
  s.on("join", async (slug) => {
    slug = String(slug || "").trim().slice(0, 80) || "home";
    s.join(slug);

    try {
      const doc = await Pad.findOneAndUpdate(
        { slug },
        { $setOnInsert: { text: "" }, $currentDate: { updatedAt: true } },
        { upsert: true, new: true }
      ).lean();

      const text = doc?.text || "";

      pads.set(slug, { text, t: Date.now() });
      s.emit("init", text);

      if (pads.size > MAX_PADS) {
        let oldestKey = null;
        let oldestT = Infinity;
        for (const [k, v] of pads) {
          if (v.t < oldestT) {
            oldestT = v.t;
            oldestKey = k;
          }
        }
        if (oldestKey) pads.delete(oldestKey);
      }
    } catch (e) {
      console.error("Mongo read/create failed:", e?.message || e);
      s.emit("init", "");
    }
  });

  s.on("edit", ({ slug, text }) => {
    const now = Date.now();
    const prev = lastEditAt.get(s.id) || 0;
    if (now - prev < 120) return;
    lastEditAt.set(s.id, now);

    slug = String(slug || "").trim().slice(0, 80) || "home";
    text = String(text ?? "");
    if (text.length > 200000) text = text.slice(0, 200000);

    pads.set(slug, { text, t: now });
    s.to(slug).emit("remote", text);
    scheduleSave(slug, text);
  });

  s.on("disconnect", () => lastEditAt.delete(s.id));
});
// ✅ RAM cleanup after 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pads) {
    if (now - v.t > 24 * 60 * 60 * 1000) pads.delete(k);
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Running on port ${PORT}`));
