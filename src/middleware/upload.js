'use strict';

const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const MAGIC = {
  '.pdf': [Buffer.from('%PDF')],
  '.docx': [Buffer.from('PK')],
  '.png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  '.jpg': [Buffer.from([0xff, 0xd8, 0xff])],
  '.jpeg': [Buffer.from([0xff, 0xd8, 0xff])]
};

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function singleFileUpload({ field, dir, extensions, maxBytes, label, optional = false }) {
  fs.mkdirSync(dir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${req.session.userId}-${Date.now()}${ext}`);
      }
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();

      if (!extensions.includes(ext)) {
        return cb(httpError(
          `${label} must be one of: ${extensions.map(x => x.slice(1).toUpperCase()).join(', ')}.`
        ));
      }

      cb(null, true);
    }
  }).single(field);

  return (req, res, next) => {
    upload(req, res, err => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(httpError(
            `${label} is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`
          ));
        }

        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(httpError(
            `Attach the file using the form-data key "${field}".`
          ));
        }

        return next(err);
      }

      if (!req.file) {
        if (optional) return next();
        return next(httpError(`Please choose a file to upload (form-data key "${field}").`));
      }
 
      try {
        const ext = path.extname(req.file.originalname).toLowerCase();
        const fd = fs.openSync(req.file.path, 'r');
        const head = Buffer.alloc(8);
        fs.readSync(fd, head, 0, 8, 0);
        fs.closeSync(fd);

        const signatures = MAGIC[ext] || [];
        const ok = !signatures.length ||
          signatures.some(sig => head.subarray(0, sig.length).equals(sig));

        if (!ok) {
          fs.unlinkSync(req.file.path);
          return next(httpError(`The uploaded file is not a valid ${ext.slice(1).toUpperCase()} file.`));
        }
      } catch (e) {
        return next(e);
      }

      next();
    });
  };
}

function removeFileQuietly(file) {
  if (!file) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { singleFileUpload, removeFileQuietly, httpError };
