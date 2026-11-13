import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ZodError } from "zod";
import { config } from "./config/env.js";
import { api } from "./controllers/api.js";
import { enhancements } from "./routes/enhancements.js";
export const app = express();
app.use(helmet());
app.use(cors({ origin: config.origin }));
app.use(express.json({ limit: "100kb" }));
app.use('/api',enhancements);
app.use("/api", api);
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));
app.use((error, req, res, next) => {
  if (error instanceof ZodError)
    return res
      .status(400)
      .json({
        error: error.issues
          .map((v) => `${v.path.join(".") || "Form"}: ${v.message}`)
          .join("; "),
      });
  if (error.code === "23503")
    return res
      .status(409)
      .json({
        error:
          "This record is linked to another record. Check your selection or keep the existing record.",
      });
  if (error.code === "23505")
    return res.status(409).json({ error: "This record already exists." });
  if (error.code === 'P0001') return res.status(409).json({error:error.message});
  if (["23514", "22P02", "22007", "22008", "22003"].includes(error.code))
    return res
      .status(400)
      .json({ error: "Invalid field value. Check the form." });
  const status = error.status || 500;
  if (status >= 500) console.error(error.message);
  res
    .status(status)
    .json({
      error:
        status >= 500
          ? "The server could not complete the request. Check the API and PostgreSQL connection."
          : error.message,
    });
});
if (process.env.NODE_ENV !== "test")
  app.listen(config.port, "127.0.0.1", () =>
    console.log(`Studio API: http://localhost:${config.port}`),
  );
