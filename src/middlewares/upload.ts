import multer from "multer";
import type { RequestHandler } from "express";
import { AppError } from "./error-handler";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      cb(new AppError(400, "Format foto harus JPEG, PNG, atau WEBP"));
      return;
    }
    cb(null, true);
  },
});

// Bungkus multer agar error-nya jadi AppError (400), bukan 500 generik.
export function uploadSinglePhoto(): RequestHandler {
  const handler = upload.single("foto");
  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError(400, "Ukuran foto maksimal 2 MB"));
        }
        return next(new AppError(400, `Upload gagal: ${err.code}`));
      }
      return next(err);
    });
  };
}
