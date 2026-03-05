# FraudDetectionPS5
Detect Fraud in large dataset
Use this schema for a transaction
{
    "id": "txn_1001",
    "accountId": "acc_001",
    "timestamp": "2026-02-12T08:15:00Z",
    "amount": 75.5,
    "currency": "USD",
    "merchant": "Local Grocery",
    "category": "groceries",
    "channel": "debit_card",
    "location": "Boston, MA",
    "deviceId": "dev_abc123"
  }

  You should create around 100 transactions with a few that are fraudulent in each batch. 
  
  High-Level Architecture

You want:

Input: Stream/list of transactions

Chunking: Split into batches of 20

Parallel LLM Calls: Send each batch to the model concurrently

Aggregation: Collect suspicious transactions

Single Write: Write all suspicious transactions to one file via a Tool
