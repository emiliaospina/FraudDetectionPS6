const fs = require('fs');
const path = require('path');

/**
 * Loads transactions from sampleData.json and chunks them into batches
 * @param {number} batchSize - Number of transactions per batch (default: 20)
 * @returns {Promise<Array>} Array of batches, each containing up to batchSize transactions
 */
async function loadAndBatchTransactions(batchSize = 20) {
  try {
    const dataPath = path.join(__dirname, '../../data/sampleData.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const transactions = JSON.parse(rawData);

    console.log(`Loaded ${transactions.length} transactions`);

    // Split into batches
    const batches = [];
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      batches.push(batch);
    }

    console.log(`Created ${batches.length} batches of up to ${batchSize} transactions each`);
    return batches;
  } catch (error) {
    console.error('Error loading and batching transactions:', error.message);
    throw error;
  }
}

module.exports = {
  loadAndBatchTransactions
};
