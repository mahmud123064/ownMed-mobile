import cors from "cors";
import express from "express";

import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/auth", authRouter);

// Order matters: unmatched routes become 404s, then every error is shaped by
// the single error handler.
app.use(notFound);
app.use(errorHandler);
