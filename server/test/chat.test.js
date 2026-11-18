const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app } = require('../src/app');
const { activeSessions, handleCancel, handleStream } = require('../src/api/routes/chat');

test('activeSessions store is initialized', () => {
  assert.ok(activeSessions instanceof Map);
});

test('handleCancel returns success even if session is already completed or unknown', () => {
  let jsonOutput = null;
  const mockReq = { body: { sessionId: 'unknown_session_123' } };
  const mockRes = {
    status(code) {
      assert.equal(code, 200);
      return this;
    },
    json(data) {
      jsonOutput = data;
      return this;
    }
  };

  handleCancel(mockReq, mockRes);
  assert.equal(jsonOutput.success, true);
});

test('handleCancel successfully marks active session as cancelled', () => {
  const sessionId = 'test_session_active';
  let writtenEvents = [];
  let ended = false;

  const mockRes = {
    write(str) {
      writtenEvents.push(str);
    },
    end() {
      ended = true;
    }
  };

  activeSessions.set(sessionId, {
    sessionId,
    res: mockRes,
    cancelled: false,
    timer: null
  });

  const mockReq = { body: { sessionId } };
  let jsonOutput = null;
  const mockResCancel = {
    status(code) {
      return this;
    },
    json(data) {
      jsonOutput = data;
      return this;
    }
  };

  handleCancel(mockReq, mockResCancel);

  assert.equal(jsonOutput.success, true);
  assert.equal(ended, true);
  assert.ok(writtenEvents.some((evt) => evt.includes('event: cancelled')));
  assert.equal(activeSessions.has(sessionId), false);
});

test('handleStream emits connected, chunk, failover, and done SSE events', async () => {
  const sessionId = 'test_stream_session';
  const writtenEvents = [];
  let headers = {};
  let ended = false;

  const mockReq = {
    method: 'POST',
    body: {
      sessionId,
      prompt: 'Test query',
      simulateFailover: true
    },
    on(event, handler) {}
  };

  const streamCompletedPromise = new Promise((resolve) => {
    const mockRes = {
      setHeader(name, val) {
        headers[name] = val;
      },
      write(str) {
        writtenEvents.push(str);
      },
      end() {
        ended = true;
        resolve();
      }
    };

    handleStream(mockReq, mockRes);
  });

  await streamCompletedPromise;

  assert.equal(headers['Content-Type'], 'text/event-stream');
  assert.equal(headers['Cache-Control'], 'no-cache, no-transform');
  assert.equal(ended, true);

  const fullOutput = writtenEvents.join('');
  assert.ok(fullOutput.includes('event: connected'));
  assert.ok(fullOutput.includes('event: status'));
  assert.ok(fullOutput.includes('event: failover'));
  assert.ok(fullOutput.includes('RATE_LIMIT_EXCEEDED'));
  assert.ok(fullOutput.includes('event: chunk'));
  assert.ok(fullOutput.includes('event: done'));
});
