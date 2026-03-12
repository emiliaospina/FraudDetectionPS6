const fs = require('fs');
const path = require('path');

const SUSPICIOUS_FILE = path.join(__dirname, '../../data/suspiciousTransactions.json');

/**
 * Initialize the suspicious transactions file if it doesn't exist or is empty
 */
function initializeFile() {
  if (!fs.existsSync(SUSPICIOUS_FILE)) {
    fs.writeFileSync(SUSPICIOUS_FILE, JSON.stringify([], null, 2), 'utf-8');
    return;
  }

  const existingData = fs.readFileSync(SUSPICIOUS_FILE, 'utf-8');
  if (!existingData.trim()) {
    fs.writeFileSync(SUSPICIOUS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

/**
 * Gets all suspicious transactions currently recorded
 * @returns {Promise<Array>} Array of suspicious transaction objects
 */
async function getSuspiciousTransactions() {
  try {
    initializeFile();
    const data = fs.readFileSync(SUSPICIOUS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading suspicious transactions:', error.message);
    return [];
  }
}

/**
 * Adds a suspicious transaction to the file
 * @param {Object} transaction - Transaction object with fraud reason
 * @param {string} reason - Why it was flagged as suspicious
 * @returns {Promise<Object>} The added transaction
 */
async function addSuspiciousTransaction(transaction, reason) {
  try {
    initializeFile();
    const transactions = await getSuspiciousTransactions();
    
    // Add fraud detection metadata
    const flaggedTransaction = {
      ...transaction,
      flaggedReason: reason,
      flaggedAt: new Date().toISOString()
    };

    transactions.push(flaggedTransaction);
    fs.writeFileSync(SUSPICIOUS_FILE, JSON.stringify(transactions, null, 2), 'utf-8');
    
    console.log(`Added suspicious transaction: ${transaction.id} - ${reason}`);
    return flaggedTransaction;
  } catch (error) {
    console.error('Error adding suspicious transaction:', error.message);
    throw error;
  }
}

/**
 * Clears all suspicious transactions (use for fresh run)
 * @returns {Promise<void>}
 */
async function clearSuspiciousTransactions() {
  try {
    fs.writeFileSync(SUSPICIOUS_FILE, JSON.stringify([], null, 2), 'utf-8');
    console.log('Cleared suspicious transactions file');
  } catch (error) {
    console.error('Error clearing suspicious transactions:', error.message);
    throw error;
  }
}

module.exports = {
  getSuspiciousTransactions,
  addSuspiciousTransaction,
  clearSuspiciousTransactions
};
