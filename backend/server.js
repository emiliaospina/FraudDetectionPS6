require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { startFraudDetectionWithCallbacks } = require('./orchestrator');
const { getSuspiciousTransactions } = require('./utils/stateManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files from ../frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Track SSE clients
const sseClients = new Set();
let isProcessing = false;

function broadcastSseEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

app.get('/api/health', (req, res) => {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  res.json({
    ok: true,
    service: 'fraud-detection-backend',
    hasOpenAiKey: hasApiKey,
    isProcessing,
    sseClients: sseClients.size
  });
});

// SSE endpoint for real-time monitoring
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Initial event so the UI can confirm connection
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connected' })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Start fraud detection job
app.post('/api/analyze', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: 'OPENAI_API_KEY is not set in environment'
    });
  }

  if (isProcessing) {
    return res.status(409).json({
      success: false,
      error: 'A fraud detection run is already in progress'
    });
  }

  const { batchSize = 20 } = req.body || {};

  isProcessing = true;

  // Immediate acknowledgement so UI is not blocked
  res.json({
    success: true,
    message: 'Fraud detection started',
    config: { batchSize }
  });

  broadcastSseEvent({
    type: 'run_started',
    message: 'Fraud detection run started',
    data: { batchSize }
  });

  try {
    const result = await startFraudDetectionWithCallbacks(
      (event) => {
        broadcastSseEvent(event);
      },
      { batchSize }
    );

    broadcastSseEvent({
      type: 'run_finished',
      message: 'Fraud detection run finished',
      data: result
    });
  } catch (error) {
    broadcastSseEvent({
      type: 'run_failed',
      message: 'Fraud detection run failed',
      data: { error: error.message }
    });
  } finally {
    isProcessing = false;
  }
});

// Get current suspicious transactions from state
app.get('/api/suspicious-transactions', async (req, res) => {
  try {
    const transactions = await getSuspiciousTransactions();
    res.json({ success: true, count: transactions.length, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback route for simple frontend navigation
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../frontend/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({
        success: false,
        error: 'Frontend not found yet. Create frontend/index.html in next step.'
      });
    }
  });
});

app.listen(PORT, () => {
  console.log('');
  console.log('==============================================');
  console.log('Fraud Detection Backend started');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`SSE:    http://localhost:${PORT}/api/events`);
  console.log('==============================================');
  console.log('');
});
