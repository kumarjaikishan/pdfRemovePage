const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const archiver = require("archiver");
const { PDFDocument } = require("pdf-lib");

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Middlewares ---------- */
app.use(cors());

/* ---------- Multer (MEMORY STORAGE – Vercel safe) ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB per PDF (adjust if needed)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  }
});

/* ---------- REMOVE PAGE + ZIP (STREAMED) ---------- */
app.post("/remove-page", upload.array("pdfs", 20), async (req, res) => {
  try {
    const removePage = parseInt(req.body.removePage, 10);

    if (!removePage || removePage < 1) {
      return res.status(400).json({ message: "Invalid page number" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No PDFs uploaded" });
    }

    /* ---- Set response headers for ZIP ---- */
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=processed-${Date.now()}.zip`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", err => {
      console.error("Archive error:", err);
      res.status(500).end();
    });

    /* ---- Pipe ZIP directly to response (NO FILE SYSTEM) ---- */
    archive.pipe(res);

    /* ---- Process each PDF ---- */
    for (const file of req.files) {
      const pdfDoc = await PDFDocument.load(file.buffer);

      const pageIndex = removePage - 1; // convert to 0-based index

      if (pageIndex < pdfDoc.getPageCount()) {
        pdfDoc.removePage(pageIndex);
      }

      const modifiedPdf = await pdfDoc.save();
      const buffer = Buffer.from(modifiedPdf);

      archive.append(buffer, {
        name: `modified-${file.originalname}`
      });
    }

    await archive.finalize(); // triggers download

  } catch (err) {
    console.error("Processing error:", err);
    res.status(500).json({ message: "PDF processing failed" });
  }
});

/* ---------- Health check ---------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------- Start server (local only, ignored by Vercel) ---------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
