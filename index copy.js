const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const archiver = require("archiver");
const { PDFDocument } = require("pdf-lib");

const app = express();
const PORT = 5000;

/* ---------- Ensure required folders exist ---------- */
["uploads", "output", "public"].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

/* ---------- Middlewares ---------- */
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

/* ---------- Multer config (PDF only) ---------- */
// const upload = multer({
//   dest: "uploads/",
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype === "application/pdf") {
//       cb(null, true);
//     } else {
//       cb(new Error("Only PDF files are allowed"));
//     }
//   }
// });
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF allowed"));
  }
});


/* ---------- MULTI PDF PROCESS → ZIP ---------- */
app.post("/remove-page", upload.array("pdfs", 20), async (req, res) => {
  try {
    const removePage = parseInt(req.body.removePage, 10);

    if (!removePage || removePage < 1) {
      return res.status(400).json({ message: "Invalid page number" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No PDFs uploaded" });
    }

    const zipName = `processed-${Date.now()}.zip`;
    const zipPath = path.join("output", zipName);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", err => {
      console.error(err);
      return res.status(500).end();
    });

    archive.pipe(output);

    for (const file of req.files) {
      const pdfBytes = fs.readFileSync(file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);

      const pageIndex = removePage - 1; // 1-based → 0-based

      if (pageIndex < pdfDoc.getPageCount()) {
        pdfDoc.removePage(pageIndex);
      }

      const modifiedPdf = await pdfDoc.save();
      const buffer = Buffer.from(modifiedPdf);

      archive.append(buffer, {
        name: `modified-${file.originalname}`
      });

      fs.unlinkSync(file.path);
    }

    await archive.finalize();

    output.on("close", () => {
      res.download(zipPath, () => fs.unlinkSync(zipPath));
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Processing failed" });
  }
});


/* ---------- Serve frontend ---------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------- Start server ---------- */
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
