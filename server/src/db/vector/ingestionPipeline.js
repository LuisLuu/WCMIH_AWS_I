import { generateMockEmbedding } from '../queries/vectorSearch.js';
import { pool } from '../../config/db.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Extract plain text from supported document buffers.
 * Supported mime types / extensions: .txt, .md, .pdf
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} originalname - Original file name with extension
 * @param {string} mimetype - MIME type reported by multipart/form-data
 * @returns {Promise<string>} Extracted plain text content
 */
export async function extractTextFromBuffer(buffer, originalname = '', mimetype = '') {
  const lowerName = originalname.toLowerCase();

  if (mimetype === 'application/pdf' || lowerName.endsWith('.pdf')) {
    try {
      const pdfModule = require('pdf-parse');
      // Support various export formats of pdf-parse
      if (typeof pdfModule === 'function') {
        const data = await pdfModule(buffer);
        return data.text || '';
      } else if (pdfModule?.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        try {
          const textResult = await parser.getText();
          return typeof textResult === 'string' ? textResult : (textResult?.text || '');
        } finally {
          if (typeof parser.destroy === 'function') {
            await parser.destroy();
          }
        }
      } else if (typeof pdfModule?.default === 'function') {
        const data = await pdfModule.default(buffer);
        return data.text || '';
      }
      return buffer.toString('utf-8');
    } catch (err) {
      console.warn(`[ingestion] Failed to parse PDF with pdf-parse (${err.message}), falling back to text representation.`);
      return buffer.toString('utf-8');
    }
  }

  // .txt, .md, and other text-based uploads
  return buffer.toString('utf-8');
}

/**
 * Split text into overlapping chunks of fixed size.
 *
 * @param {string} text - Raw input document text
 * @param {number} chunkSize - Max characters per chunk (default: 800)
 * @param {number} overlap - Overlapping character count (default: 150)
 * @returns {string[]} Array of non-empty text chunks
 */
export function chunkDocumentText(text, chunkSize = 800, overlap = 150) {
  if (!text || typeof text !== 'string') return [];

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < normalized.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex < normalized.length) {
      // Prefer breaking at paragraph or line break if nearby
      const lastLineBreak = normalized.lastIndexOf('\n', endIndex);
      if (lastLineBreak > startIndex + (chunkSize / 2)) {
        endIndex = lastLineBreak;
      } else {
        const lastSpace = normalized.lastIndexOf(' ', endIndex);
        if (lastSpace > startIndex + (chunkSize / 2)) {
          endIndex = lastSpace;
        }
      }
    } else {
      endIndex = normalized.length;
    }

    const chunk = normalized.slice(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (endIndex >= normalized.length) {
      break;
    }

    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  return chunks;
}

/**
 * Ingests a file buffer into the Vector Knowledge Vault (document_memories table).
 *
 * @param {object} params
 * @param {Buffer} params.buffer - Uploaded file buffer
 * @param {string} params.fileName - Original file name
 * @param {string} params.sourceType - Document category (e.g. 'SAP_ARCHITECTURE', 'AWS_RUNBOOK', 'LIVE_UPLOAD')
 * @param {string} params.userId - Owner user UUID
 * @param {string|null} [params.sessionId] - Optional associated session UUID
 * @param {string} [params.mimetype] - MIME type
 * @param {object} [params.metadata] - Optional additional metadata
 * @param {pg.Pool|pg.Client} [params.dbClient] - Optional injected db pool/client for transactions or mocking
 * @returns {Promise<{ documentId: string, fileName: string, totalChunks: number, chunks: object[] }>}
 */
export async function ingestDocument({
  buffer,
  fileName,
  sourceType = 'LIVE_UPLOAD',
  userId,
  sessionId = null,
  mimetype = '',
  metadata = {},
  dbClient = pool
}) {
  if (!buffer || buffer.length === 0) {
    throw new Error('File buffer is empty or missing');
  }
  if (!fileName) {
    throw new Error('File name is required');
  }
  if (!userId) {
    throw new Error('userId is required for document ingestion');
  }

  // 1. Extract plain text
  const rawText = await extractTextFromBuffer(buffer, fileName, mimetype);
  if (!rawText.trim()) {
    throw new Error('Uploaded document contains no extractable text');
  }

  // 2. Split into overlapping chunks
  const chunks = chunkDocumentText(rawText);
  if (chunks.length === 0) {
    throw new Error('Failed to create text chunks from document');
  }

  const client = typeof dbClient.connect === 'function' ? await dbClient.connect() : dbClient;
  const isDedicatedClient = typeof dbClient.connect === 'function';

  try {
    if (isDedicatedClient) {
      await client.query('BEGIN');
    }

    const insertedChunks = [];
    const baseMetadata = {
      ...metadata,
      uploadedAt: new Date().toISOString(),
      fileName,
      mimetype
    };

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      // Generate 768-dim normalized embedding matching Migration 006
      const embeddingArray = await generateMockEmbedding(chunkText);
      const vectorLiteral = '[' + embeddingArray.join(',') + ']';

      const chunkMetadata = {
        ...baseMetadata,
        chunkIndex: i,
        totalChunks: chunks.length
      };

      const insertSql = `
        INSERT INTO document_memories (
          user_id,
          session_id,
          source_type,
          file_name,
          content_chunk,
          embedding,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb)
        RETURNING id, file_name, source_type, created_at;
      `;

      const result = await client.query(insertSql, [
        userId,
        sessionId,
        sourceType,
        fileName,
        chunkText,
        vectorLiteral,
        JSON.stringify(chunkMetadata)
      ]);

      insertedChunks.push(result.rows[0]);
    }

    if (isDedicatedClient) {
      await client.query('COMMIT');
    }

    return {
      documentId: insertedChunks[0]?.id,
      fileName,
      totalChunks: insertedChunks.length,
      chunks: insertedChunks
    };
  } catch (err) {
    if (isDedicatedClient) {
      await client.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (isDedicatedClient) {
      client.release();
    }
  }
}
