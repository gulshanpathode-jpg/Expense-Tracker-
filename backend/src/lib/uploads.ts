import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png'];

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTS.includes(ext)) {
      return cb(null, true);
    }
    const err: any = new Error('Only PDF, JPG, and PNG files are allowed');
    err.status = 400;
    cb(err);
  },
});

// Stored filePath values vary by OS/multer version ('./uploads/x.png', 'uploads\x.png',
// absolute paths). Reduce to the basename and resolve inside uploadDir so lookups work
// everywhere and path traversal is impossible.
export function resolveUploadPath(filePath: string): string {
  const name = path.basename(filePath.replace(/\\/g, '/'));
  return path.join(uploadDir, name);
}
