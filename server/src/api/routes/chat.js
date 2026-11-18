const express = require('express');

const router = express.Router();

// Track in-flight streaming sessions
const activeSessions = new Map();

function sendEvent(res, eventName, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${eventName}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  if (typeof res.flush === 'function') {
    res.flush();
  }
}

// Responses templates tailored for the WCMIH AWS AI Workspace
const sampleResponses = {
  architecture: [
    "### WCMIH AWS Architecture Analysis\n\n",
    "Based on the system design specification, here is an overview of the multi-tier AWS architecture:\n\n",
    "1. **Identity & Access**: JWT-based authentication using HMAC-SHA256 tokens validated at the Express API gateway.\n",
    "2. **Security & KMS**: Customer-managed KMS keys for envelope encryption of sensitive credentials in transit and rest.\n",
    "3. **Data Persistence**: AWS RDS PostgreSQL cluster with connection pooling and automated migration tracking (`Telemetry_Logs`).\n",
    "4. **AI Orchestration**: Multi-agent supervisor pattern with automated 429 rate limit failover between primary (Claude 3.5 Sonnet) and fallback (GPT-4o) inference providers.\n\n",
    "All communications enforce TLS 1.3 and strict CORS origin verification."
  ],
  failoverDemo: [
    "### Agent Execution with Automatic Failover\n\n",
    "**Supervisor:** Query dispatched to primary agent node.\n\n",
    "Processing comprehensive security scan of database access policies...\n",
    "Scanning PostgreSQL schemas and KMS key rotation logs...\n",
    "Analysis completed successfully across all nodes with fallback model verification."
  ],
  default: [
    "Hello! I am your **WCMIH Real-Time AI Agent**. I can assist you with:\n\n",
    "- Inspecting and running database migrations (`Telemetry_Logs`)\n",
    "- Testing AWS KMS envelope encryption workflows\n",
    "- Monitoring workspace token consumption and agent throughput\n",
    "- Evaluating agent routing and **429 rate-limit failovers**\n\n",
    "How can I assist your workflow today?"
  ]
};

function getResponseChunks(prompt, simulateFailover) {
  if (simulateFailover) {
    return sampleResponses.failoverDemo;
  }
  const lower = (prompt || '').toLowerCase();
  if (lower.includes('aws') || lower.includes('architecture') || lower.includes('database') || lower.includes('security')) {
    return sampleResponses.architecture;
  }
  if (prompt && prompt.trim().length > 0) {
    return [
      `I have received your query: **"${prompt.trim()}"**\n\n`,
      "Analyzing request against current workspace context and loaded documents...\n\n",
      "- **Status**: Verified and processed.\n",
      "- **Context**: Connected to WCMIH AWS Infrastructure.\n",
      "- **Recommendation**: Review active telemetry logs and token gauge metrics in your dashboard."
    ];
  }
  return sampleResponses.default;
}

// SSE Stream Endpoint (supports both POST and GET)
function handleStream(req, res) {
  const isPost = req.method === 'POST';
  const body = isPost ? (req.body || {}) : (req.query || {});
  
  const prompt = body.prompt || body.message || '';
  const sessionId = body.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const simulateFailover = Boolean(
    body.simulateFailover === true ||
    body.simulateFailover === 'true' ||
    (typeof prompt === 'string' && (prompt.toLowerCase().includes('failover') || prompt.toLowerCase().includes('429')))
  );

  const primaryModel = body.model || 'Claude 3.5 Sonnet (Anthropic)';
  const fallbackModel = body.fallbackModel || 'GPT-4o (OpenAI)';

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  const session = {
    sessionId,
    res,
    cancelled: false,
    timer: null,
  };

  activeSessions.set(sessionId, session);

  // Initial connection event
  sendEvent(res, 'connected', {
    sessionId,
    primaryModel,
    fallbackModel,
    status: 'connected',
    timestamp: new Date().toISOString()
  });

  // Thinking state
  sendEvent(res, 'status', {
    status: 'thinking',
    message: 'Analyzing workspace context and routing query...'
  });

  const responseSections = getResponseChunks(prompt, simulateFailover);
  // Flatten sections into smaller tokens for smooth real-time streaming
  const chunks = [];
  for (const section of responseSections) {
    // Break into small word/punctuation fragments (1-3 words)
    const words = section.split(/(\s+)/);
    let buffer = '';
    for (const w of words) {
      buffer += w;
      if (buffer.length >= 8 || w === '\n') {
        chunks.push(buffer);
        buffer = '';
      }
    }
    if (buffer) {
      chunks.push(buffer);
    }
  }

  let chunkIndex = 0;
  let didFailover = false;
  const startTime = Date.now();

  function streamNextChunk() {
    if (session.cancelled) {
      return;
    }

    // Trigger 429 Failover at chunk 2 if simulation is active
    if (simulateFailover && !didFailover && chunkIndex === 2) {
      didFailover = true;
      // Send 429 Failover notification event
      sendEvent(res, 'failover', {
        code: 429,
        status: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit (429) hit on ${primaryModel}. Seamlessly failing over to ${fallbackModel}.`,
        primaryModel,
        fallbackModel,
        retryAfter: 60,
        timestamp: new Date().toISOString()
      });

      // Update agent state
      sendEvent(res, 'status', {
        status: 'failover_active',
        activeModel: fallbackModel,
        message: `Failing over to ${fallbackModel} due to primary rate limit (429)...`
      });

      // Continue streaming with slight delay after failover
      session.timer = setTimeout(streamNextChunk, 280);
      return;
    }

    if (chunkIndex < chunks.length) {
      const delta = chunks[chunkIndex];
      sendEvent(res, 'chunk', {
        delta,
        index: chunkIndex,
        model: didFailover ? fallbackModel : primaryModel
      });
      chunkIndex += 1;

      // Smooth streaming delay between 25ms and 45ms per chunk
      const delay = Math.floor(Math.random() * 20) + 25;
      session.timer = setTimeout(streamNextChunk, delay);
    } else {
      // Completed streaming
      const finalModel = didFailover ? fallbackModel : primaryModel;
      const durationMs = Date.now() - startTime;
      
      sendEvent(res, 'done', {
        sessionId,
        model: finalModel,
        failedOver: didFailover,
        tokenUsage: {
          promptTokens: Math.max(12, Math.round(prompt.length / 4)),
          completionTokens: chunks.length * 2,
          totalTokens: Math.max(12, Math.round(prompt.length / 4)) + chunks.length * 2
        },
        durationMs,
        timestamp: new Date().toISOString()
      });

      res.end();
      activeSessions.delete(sessionId);
    }
  }

  // Handle client disconnect
  if (typeof res.on === 'function') {
    res.on('close', () => {
      if (!res.writableEnded) {
        session.cancelled = true;
        if (session.timer) {
          clearTimeout(session.timer);
        }
        activeSessions.delete(sessionId);
      }
    });
  }

  // Start streaming immediately
  streamNextChunk();
}

// Cancel generation handler
function handleCancel(req, res) {
  const sessionId = req.body?.sessionId || req.query?.sessionId;

  if (!sessionId) {
    // If no sessionId specified, check if there is an active session
    const active = activeSessions.values().next().value;
    if (active) {
      active.cancelled = true;
      if (active.timer) {
        clearTimeout(active.timer);
      }
      sendEvent(active.res, 'cancelled', {
        sessionId: active.sessionId,
        message: 'Generation stopped by user'
      });
      active.res.end();
      activeSessions.delete(active.sessionId);
      return res.json({ success: true, sessionId: active.sessionId, message: 'Active generation stopped' });
    }
    return res.status(200).json({ success: true, message: 'No active generation found' });
  }

  const session = activeSessions.get(sessionId);
  if (session) {
    session.cancelled = true;
    if (session.timer) {
      clearTimeout(session.timer);
    }
    sendEvent(session.res, 'cancelled', {
      sessionId,
      message: 'Generation stopped by user'
    });
    session.res.end();
    activeSessions.delete(sessionId);
    return res.json({ success: true, sessionId, message: 'Generation stopped by user' });
  }

  return res.status(200).json({ success: true, message: 'No active session with this ID or already completed' });
}

router.post('/chat/stream', handleStream);
router.get('/chat/stream', handleStream);
router.post('/chat/cancel', handleCancel);
router.post('/cancel', handleCancel);
router.get('/cancel', handleCancel);

module.exports = {
  chatRouter: router,
  handleStream,
  handleCancel,
  activeSessions
};
