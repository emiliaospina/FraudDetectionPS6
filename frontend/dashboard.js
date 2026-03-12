const state = {
  suspiciousTransactions: [],
  activityEvents: [],
  eventSource: null
};

const elements = {
  backendStatus: document.getElementById('backend-status'),
  streamStatus: document.getElementById('stream-status'),
  runStatus: document.getElementById('run-status'),
  controlMessage: document.getElementById('control-message'),
  batchSizeInput: document.getElementById('batch-size'),
  startButton: document.getElementById('start-analysis-button'),
  refreshButton: document.getElementById('refresh-state-button'),
  summaryProcessed: document.getElementById('summary-processed'),
  summaryFlagged: document.getElementById('summary-flagged'),
  summaryBatches: document.getElementById('summary-batches'),
  summaryLastEvent: document.getElementById('summary-last-event'),
  suspiciousEmptyState: document.getElementById('suspicious-empty-state'),
  suspiciousList: document.getElementById('suspicious-list'),
  activityLog: document.getElementById('activity-log')
};

function setStatus(element, text, tone) {
  element.textContent = text;
  element.className = `status-pill ${tone}`;
}

function setControlMessage(message) {
  elements.controlMessage.textContent = message;
}

function addActivity(message, tone = 'neutral') {
  const timestamp = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  item.className = `activity-item ${tone}`;
  item.textContent = `[${timestamp}] ${message}`;

  elements.activityLog.prepend(item);
  elements.summaryLastEvent.textContent = message;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addAgentLogEntry(type, data) {
  const timestamp = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  const batchLabel = `Batch ${escapeHtml(data.batchNumber)}/${escapeHtml(data.batchCount)}`;

  if (type === 'agent_iteration') {
    item.className = 'activity-item agent-iter';
    item.innerHTML =
      `<span class="log-time">[${timestamp}]</span> ` +
      `<span class="log-iter">── ${batchLabel} — Agent iteration ${escapeHtml(data.iteration)} ──────</span>`;
  } else if (type === 'agent_thinking') {
    item.className = 'activity-item agent-thinking';
    const preview = escapeHtml(data.content).substring(0, 240);
    const ellipsis = data.content.length > 240 ? '…' : '';
    item.innerHTML =
      `<span class="log-time">[${timestamp}]</span> ` +
      `💭 <em class="log-thought">${preview}${ellipsis}</em>`;
  } else if (type === 'tool_call') {
    item.className = 'activity-item tool-call';
    item.innerHTML =
      `<span class="log-time">[${timestamp}]</span> ` +
      `📤 <strong>${escapeHtml(data.toolName)}</strong> ` +
      `<span class="log-batch">[${batchLabel}]</span>` +
      `<div class="log-detail">${escapeHtml(data.inputPreview)}</div>`;
  } else if (type === 'tool_result') {
    item.className = 'activity-item tool-result';
    item.innerHTML =
      `<span class="log-time">[${timestamp}]</span> ` +
      `📥 <span class="log-result">${escapeHtml(data.resultPreview)}</span>`;
  }

  elements.activityLog.prepend(item);
}

function getTransactionMerchant(transaction) {
  return transaction.merchantName || transaction.merchant || 'Unknown';
}

function getTransactionCurrency(transaction) {
  return transaction.currency || 'USD';
}

function resetRunState() {
  state.suspiciousTransactions = [];
  elements.summaryProcessed.textContent = '0';
  elements.summaryFlagged.textContent = '0';
  elements.summaryBatches.textContent = '0';
  renderSuspiciousTransactions();
}

function renderSuspiciousTransactions() {
  elements.suspiciousList.innerHTML = '';
  elements.summaryFlagged.textContent = String(state.suspiciousTransactions.length);

  if (state.suspiciousTransactions.length === 0) {
    elements.suspiciousEmptyState.style.display = 'block';
    return;
  }

  elements.suspiciousEmptyState.style.display = 'none';

  state.suspiciousTransactions.forEach((transaction) => {
    const card = document.createElement('article');
    card.className = 'transaction-card';

    card.innerHTML = `
      <div class="transaction-card-header">
        <strong>${transaction.id}</strong>
        <span class="transaction-amount">${getTransactionCurrency(transaction)} ${transaction.amount}</span>
      </div>
      <div class="transaction-meta">
        <span>Account: ${transaction.accountId}</span>
        <span>Merchant: ${getTransactionMerchant(transaction)}</span>
        <span>Location: ${transaction.location}</span>
        <span>Device: ${transaction.deviceId}</span>
      </div>
      <p class="transaction-reason">${transaction.flaggedReason || 'Flagged by agent'}</p>
    `;

    elements.suspiciousList.appendChild(card);
  });
}

async function loadCurrentSuspiciousTransactions() {
  const response = await fetch('/api/suspicious-transactions');
  const payload = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Failed to load suspicious transactions');
  }

  state.suspiciousTransactions = payload.transactions;
  renderSuspiciousTransactions();
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error('Health check failed');
    }

    setStatus(elements.backendStatus, 'Online', 'ok');
    setStatus(elements.runStatus, payload.isProcessing ? 'Running' : 'Idle', payload.isProcessing ? 'warn' : 'idle');
    setControlMessage(payload.hasOpenAiKey ? 'Backend ready. OpenAI key detected.' : 'Backend online, but OPENAI_API_KEY is missing.');
  } catch (error) {
    setStatus(elements.backendStatus, 'Offline', 'error');
    setControlMessage(`Backend check failed: ${error.message}`);
    addActivity(`Backend check failed: ${error.message}`, 'error');
  }
}

function upsertSuspiciousTransaction(transaction) {
  const exists = state.suspiciousTransactions.some((item) => item.id === transaction.id);
  if (!exists) {
    state.suspiciousTransactions.unshift(transaction);
  }
  renderSuspiciousTransactions();
}

function handleEvent(event) {
  const { type, message, data } = event;

  if (message) {
    const tone = type === 'error' || type === 'run_failed' ? 'error' : type === 'suspicious_detected' ? 'alert' : 'neutral';
    addActivity(message, tone);
  }

  switch (type) {
    case 'connected':
      setStatus(elements.streamStatus, 'Connected', 'ok');
      break;
    case 'run_started':
      setStatus(elements.runStatus, 'Running', 'warn');
      resetRunState();
      break;
    case 'batch_start':
      if (data && data.batchCount) {
        elements.summaryBatches.textContent = String(data.batchCount);
      }
      break;
    case 'suspicious_detected':
      if (data && data.transaction) {
        upsertSuspiciousTransaction(data.transaction);
      }
      break;
    case 'batch_complete':
      if (data && typeof data.totalProcessed === 'number') {
        const current = Number(elements.summaryProcessed.textContent) || 0;
        elements.summaryProcessed.textContent = String(current + data.totalProcessed);
      }
      break;
    case 'orchestration_complete':
    case 'run_finished':
      setStatus(elements.runStatus, 'Completed', 'ok');
      if (data && data.totalProcessed) {
        elements.summaryProcessed.textContent = String(data.totalProcessed);
      }
      if (data && data.batchCount) {
        elements.summaryBatches.textContent = String(data.batchCount);
      }
      break;
    case 'run_failed':
    case 'error':
      setStatus(elements.runStatus, 'Failed', 'error');
      break;
    case 'agent_iteration':
    case 'agent_thinking':
    case 'tool_call':
    case 'tool_result':
      if (data) addAgentLogEntry(type, data);
      break;
    default:
      break;
  }
}

function connectEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
  }

  const eventSource = new EventSource('/api/events');
  state.eventSource = eventSource;

  eventSource.onopen = () => {
    setStatus(elements.streamStatus, 'Connected', 'ok');
    addActivity('SSE stream connected.', 'ok');
  };

  eventSource.onmessage = (rawEvent) => {
    try {
      const payload = JSON.parse(rawEvent.data);
      handleEvent(payload);
    } catch (error) {
      addActivity(`Failed to parse SSE event: ${error.message}`, 'error');
    }
  };

  eventSource.onerror = () => {
    setStatus(elements.streamStatus, 'Disconnected', 'error');
    addActivity('SSE stream disconnected.', 'error');
  };
}

async function startAnalysis() {
  const batchSize = Number(elements.batchSizeInput.value) || 20;

  elements.startButton.disabled = true;
  setControlMessage(`Starting fraud detection with batch size ${batchSize}...`);

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ batchSize })
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Failed to start fraud detection');
    }

    resetRunState();
    setStatus(elements.runStatus, 'Starting', 'warn');
    setControlMessage(payload.message);
    addActivity(`Fraud detection requested with batch size ${batchSize}.`, 'neutral');
  } catch (error) {
    setStatus(elements.runStatus, 'Failed', 'error');
    setControlMessage(`Could not start analysis: ${error.message}`);
    addActivity(`Could not start analysis: ${error.message}`, 'error');
  } finally {
    elements.startButton.disabled = false;
  }
}

function bindEvents() {
  elements.startButton.addEventListener('click', startAnalysis);
  elements.refreshButton.addEventListener('click', async () => {
    try {
      await loadCurrentSuspiciousTransactions();
      addActivity('Suspicious transaction state refreshed.', 'ok');
    } catch (error) {
      addActivity(`Refresh failed: ${error.message}`, 'error');
    }
  });
}

async function initializeDashboard() {
  bindEvents();
  resetRunState();
  await checkHealth();
  connectEventStream();
}

initializeDashboard().catch((error) => {
  addActivity(`Dashboard initialization failed: ${error.message}`, 'error');
});
