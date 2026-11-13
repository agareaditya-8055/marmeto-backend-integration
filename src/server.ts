
import "reflect-metadata";
import express from "express";

const app = express();

const PORT = 3000;

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Marmeto Integration Service is running",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
