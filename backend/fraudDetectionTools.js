const { addSuspiciousTransaction } = require('./utils/stateManager');

/**
 * Tool: Analyze Amount Anomaly
 * Detects if transaction amount is unusual for this account
 */
function analyzeAmountAnomaly(transaction, accountHistory = []) {
  const { amount } = transaction;
  
  // If no history, flag amounts > $1000 as potentially risky
  if (!accountHistory || accountHistory.length === 0) {
    if (amount > 1000) {
      return {
        isAnomalous: true,
        severity: 'medium',
        reason: `Large transaction ($${amount}) with no account history to compare`
      };
    }
    return { isAnomalous: false };
  }

  // Calculate average transaction amount from history
  const avgAmount = accountHistory.reduce((sum, t) => sum + t.amount, 0) / accountHistory.length;
  const maxAmount = Math.max(...accountHistory.map(t => t.amount));
  
  // Flag if 3x higher than average or 1.5x higher than max
  const threshold = Math.max(avgAmount * 3, maxAmount * 1.5);
  if (amount > threshold) {
    return {
      isAnomalous: true,
      severity: 'high',
      reason: `Transaction amount ($${amount}) is ${(amount / avgAmount).toFixed(1)}x the account average ($${avgAmount.toFixed(2)})`
    };
  }

  return { isAnomalous: false };
}

/**
 * Tool: Check Location Velocity
 * Detects geographically impossible transactions
 */
function checkLocationVelocity(transaction, accountHistory = []) {
  const { location, timestamp } = transaction;

  if (!accountHistory || accountHistory.length === 0) {
    return { isVelocityViolation: false };
  }

  // Get the most recent transaction
  const lastTxn = accountHistory[accountHistory.length - 1];
  if (!lastTxn || !lastTxn.location) {
    return { isVelocityViolation: false };
  }

  const lastLocation = lastTxn.location;
  const lastTimestamp = new Date(lastTxn.timestamp);
  const currentTimestamp = new Date(timestamp);

  // Time difference in minutes
  const timeDiffMinutes = (currentTimestamp - lastTimestamp) / (1000 * 60);

  // Simplified: flag if different location and less than 30 minutes apart
  // (In reality, you'd calculate distance and max travel speed)
  if (lastLocation !== location && timeDiffMinutes < 30 && timeDiffMinutes > 0) {
    return {
      isVelocityViolation: true,
      severity: 'high',
      reason: `Transaction in ${location} only ${timeDiffMinutes.toFixed(0)} minutes after transaction in ${lastLocation}`
    };
  }

  return { isVelocityViolation: false };
}

/**
 * Tool: Evaluate Merchant Risk
 * Flags risky merchant categories
 */
function evaluateMerchantRisk(transaction) {
  const { merchantName, merchantCategory } = transaction;

  // Define risky categories and merchants
  const riskyCategories = ['crypto', 'wire_transfer', 'money_transfer', 'prepaid_card'];
  const riskyMerchants = ['coinbase', 'western union', 'money gram', 'bitcoin'];

  let riskScore = 0;
  let reason = [];

  if (riskyCategories.includes(merchantCategory?.toLowerCase())) {
    riskScore += 1;
    reason.push(`Category "${merchantCategory}" is flagged as high-risk`);
  }

  if (riskyMerchants.some(m => merchantName?.toLowerCase().includes(m))) {
    riskScore += 2;
    reason.push(`Merchant "${merchantName}" is known for fraud patterns`);
  }

  if (riskScore > 0) {
    return {
      isRisky: true,
      severity: riskScore >= 2 ? 'high' : 'medium',
      reason: reason.join('; ')
    };
  }

  return { isRisky: false };
}

/**
 * Tool: Verify Device Consistency
 * Checks if device matches account's usual devices
 */
function verifyDeviceConsistency(transaction, accountHistory = []) {
  const { deviceId } = transaction;

  if (!accountHistory || accountHistory.length === 0) {
    return { isConsistent: false, severity: 'low', reason: 'No device history to verify against' };
  }

  // Get all devices used in account history
  const knownDevices = [...new Set(accountHistory.map(t => t.deviceId))];

  if (knownDevices.includes(deviceId)) {
    return { isConsistent: true };
  }

  return {
    isConsistent: false,
    severity: 'medium',
    reason: `Device "${deviceId}" has not been used for this account before. Known devices: ${knownDevices.join(', ')}`
  };
}

/**
 * Tool: Record Suspicious Transaction
 * Agent calls this to flag a transaction as suspicious
 */
async function recordSuspiciousTransaction(transaction, reasonSummary) {
  try {
    const result = await addSuspiciousTransaction(transaction, reasonSummary);
    return {
      success: true,
      message: `Recorded transaction ${transaction.id} as suspicious`,
      transaction: result
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to record transaction: ${error.message}`
    };
  }
}

/**
 * Tool: Get Historical Context
 * Retrieves past transactions for an account (simulated data)
 */
function getHistoricalContext(accountId) {
  // In production, this would query a database
  // For now, return a simulated history
  const mockHistory = {
    acc_001: [
      { id: 'txn_old_1', accountId: 'acc_001', amount: 50, location: 'Boston, MA', timestamp: '2026-02-11T10:00:00Z', deviceId: 'dev_abc123' },
      { id: 'txn_old_2', accountId: 'acc_001', amount: 75, location: 'Boston, MA', timestamp: '2026-02-11T14:00:00Z', deviceId: 'dev_abc123' },
      { id: 'txn_old_3', accountId: 'acc_001', amount: 120, location: 'Boston, MA', timestamp: '2026-02-11T18:00:00Z', deviceId: 'dev_abc123' }
    ],
    acc_002: [
      { id: 'txn_old_4', accountId: 'acc_002', amount: 200, location: 'Cambridge, MA', timestamp: '2026-02-11T09:00:00Z', deviceId: 'dev_xyz987' },
      { id: 'txn_old_5', accountId: 'acc_002', amount: 150, location: 'Cambridge, MA', timestamp: '2026-02-11T15:00:00Z', deviceId: 'dev_xyz987' }
    ],
    acc_003: [
      { id: 'txn_old_6', accountId: 'acc_003', amount: 35, location: 'Boston, MA', timestamp: '2026-02-11T08:00:00Z', deviceId: 'dev_tap444' }
    ]
  };

  return mockHistory[accountId] || [];
}

/**
 * Define tool schemas for OpenAI Agents
 * These schemas tell the Agent what tools are available and how to call them
 */
const toolSchemas = [
  {
    type: 'function',
    function: {
      name: 'analyzeAmountAnomaly',
      description: 'Analyzes if a transaction amount is anomalous for the account',
      parameters: {
        type: 'object',
        properties: {
          transaction: {
            type: 'object',
            description: 'The full transaction object from the provided list',
            properties: {
              id: { type: 'string' },
              accountId: { type: 'string' },
              amount: { type: 'number' },
              timestamp: { type: 'string' },
              merchantName: { type: 'string' },
              merchantCategory: { type: 'string' },
              location: { type: 'string' },
              deviceId: { type: 'string' },
              isNewDevice: { type: 'boolean' },
              country: { type: 'string' }
            }
          },
          accountHistory: {
            type: 'array',
            description: 'Previous transactions for this account',
            items: {
              type: 'object'
            }
          }
        },
        required: ['transaction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'checkLocationVelocity',
      description: 'Detects geographically impossible transactions (e.g., two locations too close in time)',
      parameters: {
        type: 'object',
        properties: {
          transaction: {
            type: 'object',
            description: 'The full transaction object from the provided list',
            properties: {
              id: { type: 'string' },
              accountId: { type: 'string' },
              amount: { type: 'number' },
              timestamp: { type: 'string' },
              merchantName: { type: 'string' },
              merchantCategory: { type: 'string' },
              location: { type: 'string' },
              deviceId: { type: 'string' },
              isNewDevice: { type: 'boolean' },
              country: { type: 'string' }
            }
          },
          accountHistory: {
            type: 'array',
            description: 'Previous transactions for this account',
            items: {
              type: 'object'
            }
          }
        },
        required: ['transaction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'evaluateMerchantRisk',
      description: 'Evaluates if the merchant is known for fraud patterns',
      parameters: {
        type: 'object',
        properties: {
          transaction: {
            type: 'object',
            description: 'The full transaction object from the provided list',
            properties: {
              id: { type: 'string' },
              accountId: { type: 'string' },
              amount: { type: 'number' },
              timestamp: { type: 'string' },
              merchantName: { type: 'string' },
              merchantCategory: { type: 'string' },
              location: { type: 'string' },
              deviceId: { type: 'string' },
              isNewDevice: { type: 'boolean' },
              country: { type: 'string' }
            }
          }
        },
        required: ['transaction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verifyDeviceConsistency',
      description: 'Checks if the device used for this transaction is consistent with the account history',
      parameters: {
        type: 'object',
        properties: {
          transaction: {
            type: 'object',
            description: 'The full transaction object from the provided list',
            properties: {
              id: { type: 'string' },
              accountId: { type: 'string' },
              amount: { type: 'number' },
              timestamp: { type: 'string' },
              merchantName: { type: 'string' },
              merchantCategory: { type: 'string' },
              location: { type: 'string' },
              deviceId: { type: 'string' },
              isNewDevice: { type: 'boolean' },
              country: { type: 'string' }
            }
          },
          accountHistory: {
            type: 'array',
            description: 'Previous transactions for this account',
            items: {
              type: 'object'
            }
          }
        },
        required: ['transaction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recordSuspiciousTransaction',
      description: 'Records a transaction as suspicious. Call this when fraud is detected.',
      parameters: {
        type: 'object',
        properties: {
          transaction: {
            type: 'object',
            description: 'The full transaction object to flag as suspicious',
            properties: {
              id: { type: 'string' },
              accountId: { type: 'string' },
              amount: { type: 'number' },
              timestamp: { type: 'string' },
              merchantName: { type: 'string' },
              merchantCategory: { type: 'string' },
              location: { type: 'string' },
              deviceId: { type: 'string' },
              isNewDevice: { type: 'boolean' },
              country: { type: 'string' }
            }
          },
          reasonSummary: {
            type: 'string',
            description: 'Brief summary of why this transaction is suspicious'
          }
        },
        required: ['transaction', 'reasonSummary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getHistoricalContext',
      description: 'Retrieves historical transactions for an account to establish baseline behavior',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            description: 'The account ID to get history for'
          }
        },
        required: ['accountId']
      }
    }
  }
];

/**
 * Map tool calls from Agent to their implementations
 */
function executeTool(toolName, toolInput) {
  switch (toolName) {
    case 'analyzeAmountAnomaly':
      return analyzeAmountAnomaly(toolInput.transaction, toolInput.accountHistory);
    case 'checkLocationVelocity':
      return checkLocationVelocity(toolInput.transaction, toolInput.accountHistory);
    case 'evaluateMerchantRisk':
      return evaluateMerchantRisk(toolInput.transaction);
    case 'verifyDeviceConsistency':
      return verifyDeviceConsistency(toolInput.transaction, toolInput.accountHistory);
    case 'recordSuspiciousTransaction':
      return recordSuspiciousTransaction(toolInput.transaction, toolInput.reasonSummary);
    case 'getHistoricalContext':
      return getHistoricalContext(toolInput.accountId);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

module.exports = {
  toolSchemas,
  executeTool,
  // Individual tool implementations (for testing)
  analyzeAmountAnomaly,
  checkLocationVelocity,
  evaluateMerchantRisk,
  verifyDeviceConsistency,
  recordSuspiciousTransaction,
  getHistoricalContext
};
