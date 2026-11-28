import express from 'express';
import multer from 'multer';
import { pool } from '../../config/db.js';
import { ingestDocument } from '../../db/vector/ingestionPipeline.js';

const router = express.Router();

// Configure multer storage in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.txt', '.md', '.pdf'];
    const originalName = file.originalname.toLowerCase();
    const hasAllowedExt = allowedExtensions.some(ext => originalName.endsWith(ext));

    if (hasAllowedExt || file.mimetype === 'application/pdf' || file.mimetype.startsWith('text/')) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE: Only .txt, .md, or .pdf files are supported.'));
    }
  }
});

/**
 * POST /api/vault/upload
 * Accepts multipart/form-data upload with field 'file'
 * Optional body fields: source_type, session_id
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Expected multipart field "file".' });
    }

    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user identity' });
    }

    const sourceType = req.body?.source_type || 'LIVE_UPLOAD';
    const sessionId = req.body?.session_id || null;

    const result = await ingestDocument({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      sourceType,
      userId,
      sessionId,
      mimetype: req.file.mimetype,
      metadata: {
        fileSize: req.file.size
      }
    });

    return res.status(201).json({
      message: 'Document successfully ingested into Vector Knowledge Vault',
      document: {
        id: result.documentId,
        fileName: result.fileName,
        totalChunks: result.totalChunks,
        sourceType
      }
    });
  } catch (error) {
    if (error.message?.startsWith('INVALID_FILE_TYPE')) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

/**
 * GET /api/vault/documents
 * List all unique documents or chunks owned by user
 */
router.get('/documents', async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rows } = await pool.query(
      `SELECT 
         file_name,
         source_type,
         MIN(id) AS id,
         COUNT(*)::int AS chunk_count,
         MIN(created_at) AS created_at
       FROM document_memories
       WHERE user_id = $1
       GROUP BY file_name, source_type
       ORDER BY created_at DESC;`,
      [userId]
    );

    return res.json({
      total: rows.length,
      documents: rows
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/vault/documents/:id
 * Delete document chunks by file_name or id owned by the user
 */
router.delete('/documents/:id', async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    // Check if :id is a UUID matching an id, or match by file_name
    let deleteResult;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (isUuid) {
      // Find the file_name associated with this chunk id
      const targetQuery = await pool.query(
        `SELECT file_name FROM document_memories WHERE id = $1 AND user_id = $2 LIMIT 1;`,
        [id, userId]
      );

      if (targetQuery.rows.length > 0) {
        const targetFileName = targetQuery.rows[0].file_name;
        deleteResult = await pool.query(
          `DELETE FROM document_memories WHERE file_name = $1 AND user_id = $2;`,
          [targetFileName, userId]
        );
      } else {
        deleteResult = await pool.query(
          `DELETE FROM document_memories WHERE id = $1 AND user_id = $2;`,
          [id, userId]
        );
      }
    } else {
      // Match directly by fileName
      deleteResult = await pool.query(
        `DELETE FROM document_memories WHERE file_name = $1 AND user_id = $2;`,
        [id, userId]
      );
    }

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }

    return res.json({
      message: 'Document deleted successfully',
      deletedChunks: deleteResult.rowCount
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
