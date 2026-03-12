const { loadAndBatchTransactions } = require('./utils/batchProcessor');
const { processTransactionBatch } = require('./agentManager');
const { clearSuspiciousTransactions, getSuspiciousTransactions } = require('./utils/stateManager');

/**
 * Main orchestrator: coordinates parallel agent processing
 * 
 * @param {Object} options Configuration options
 * @param {number} options.batchSize - Transactions per batch (default: 20)
 * @param {Function} options.onBatchStart - Callback when batch starts
 * @param {Function} options.onSuspiciousDetected - Callback when a suspicious transaction is detected
 * @param {Function} options.onBatchComplete - Callback when batch completes
 * @param {Function} options.onComplete - Callback when orchestration completes
 * @param {Function} options.onError - Callback for errors
 * @returns {Promise<Object>} Results with all flagged transactions
 */
async function runFraudDetection(options = {}) {
  const {
    batchSize = 20,
    onBatchStart = () => {},
    onSuspiciousDetected = () => {},
    onBatchComplete = () => {},
    onComplete = () => {},
    onError = () => {}
  } = options;

  try {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         FRAUD DETECTION ORCHESTRATOR - STARTING             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Step 1: Clear previous results
    console.log('\n[1/4] Clearing previous results...');
    await clearSuspiciousTransactions();

    // Step 2: Load and batch transactions
    console.log('[2/4] Loading and batching transactions...');
    const batches = await loadAndBatchTransactions(batchSize);
    const batchCount = batches.length;
    console.log(`       ✓ Created ${batchCount} batch(es) of up to ${batchSize} transactions`);

    // Step 3: Create agent factory - flexible parallel jobs
    console.log(`[3/4] Creating agent factory with ${batchCount} parallel agent(s)...`);
    const agentPromises = batches.map((batch, index) => {
      const batchNumber = index + 1;
      
      // Notify when batch starts
      onBatchStart({ batchNumber, batchCount, transactionCount: batch.length });
      
      // Create a job for this batch
      return processTransactionBatch(batch, {
        batchNumber,
        batchCount,
        onSuspiciousDetected: (event) => {
          onSuspiciousDetected(event);
        }
      })
        .then(result => {
          // Notify when batch completes
          onBatchComplete({
            batchNumber,
            batchCount,
            flaggedCount: result.flaggedTransactions.length,
            totalProcessed: result.totalProcessed
          });
          
          return result;
        });
    });

    console.log(`       ✓ Agent factory ready. Running ${batchCount} agent(s) in parallel...`);

    // Step 4: Execute all agents in parallel
    console.log('[4/4] Executing parallel agent processing...');
    const startTime = Date.now();
    const batchResults = await Promise.all(agentPromises);
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);

    // Step 5: Aggregate results
    const allAgentThinking = batchResults.flatMap(r => r.agentThinking);
    const totalProcessed = batchResults.reduce((sum, r) => sum + r.totalProcessed, 0);

    // Get final state from file
    const finalFlaggedTransactions = await getSuspiciousTransactions();

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              FRAUD DETECTION - COMPLETE                    ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Transactions Processed:  ${String(totalProcessed).padEnd(38)}║`);
    console.log(`║  Fraudulent Transactions Found: ${String(finalFlaggedTransactions.length).padEnd(38)}║`);
    console.log(`║  Processing Time:               ${String(`${elapsedTime}s`).padEnd(38)}║`);
    console.log(`║  Parallel Agents Used:          ${String(batchCount).padEnd(38)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n');

    const result = {
      success: true,
      totalProcessed,
      flaggedTransactions: finalFlaggedTransactions,
      batchCount,
      elapsedTime: parseFloat(elapsedTime),
      agentThinking: allAgentThinking,
      summary: {
        totalBatches: batchCount,
        transactionsPerBatch: batchSize,
        totalTransactionsProcessed: totalProcessed,
        fraudDetected: finalFlaggedTransactions.length,
        fraudRate: ((finalFlaggedTransactions.length / totalProcessed) * 100).toFixed(2) + '%'
      }
    };

    // Notify completion
    onComplete(result);

    return result;
  } catch (error) {
    console.error('\n❌ ORCHESTRATION ERROR:', error.message);
    
    const errorResult = {
      success: false,
      error: error.message,
      flaggedTransactions: []
    };

    onError(errorResult);
    throw error;
  }
}

/**
 * Helper: Used by server to start orchestration
 * Provides a wrapper that handles callbacks from Express routes
 */
async function startFraudDetectionWithCallbacks(progressCallback) {
  return runFraudDetection({
    onBatchStart: (info) => {
      const message = `Starting batch ${info.batchNumber}/${info.batchCount} (${info.transactionCount} transactions)...`;
      console.log(`  📊 ${message}`);
      progressCallback({
        type: 'batch_start',
        data: info,
        message
      });
    },
    onSuspiciousDetected: (event) => {
      const tx = event.transaction || {};
      const message = `Suspicious transaction detected: ${tx.id || 'unknown-id'} (batch ${event.batchNumber}/${event.batchCount})`;
      console.log(`  🚩 ${message}`);
      progressCallback({
        type: 'suspicious_detected',
        data: event,
        message
      });
    },
    onBatchComplete: (info) => {
      const message = `Batch ${info.batchNumber} complete: ${info.flaggedCount} fraudulent transactions detected`;
      console.log(`  ✓ ${message}`);
      progressCallback({
        type: 'batch_complete',
        data: info,
        message
      });
    },
    onComplete: (result) => {
      progressCallback({
        type: 'orchestration_complete',
        data: result,
        message: 'Fraud detection completed successfully'
      });
    },
    onError: (error) => {
      progressCallback({
        type: 'error',
        data: error,
        message: `Error during orchestration: ${error.error}`
      });
    }
  });
}

module.exports = {
  runFraudDetection,
  startFraudDetectionWithCallbacks
};
