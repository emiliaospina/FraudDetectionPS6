# FraudDetection PS-6
The goal is to detect Fraud in a large dataset that is larger than the context window. This means we need to break the data into chunks and process these chunks in parallel. 
The schema in sampleData.json gives some examples of transactions with some most likely fraudulent. We will start with a demo using only 100 transactions but these should be chunked into 5 batches of 20 and processed in parallel.
The user interface should allow monitoring of Agent and Tool calls so you can check what is happening. You should accumulate fraudulent transactions into a single file. You can view this accumulator as keeping "state" of the app.  
Your UI should display the fraudulent transactions in near real time. 

You should create around 100 transactions with a few that are fraudulent in each batch. 
## High-Level Architecture

You probably want the following:

Input: Stream/list of transactions

Chunking: Split into batches of 20

Parallel Agent/LLM Calls: Send each batch to Openai model concurrently

Aggregation: Write suspicious transactions into the file and to the UI via a suspiciousTransactions Tool



------

Approach:

1. Set up project structure (backend, frontend, data folders)
2. Create orchestrator (Python/Node) with batch logic
3. Define fraud detection tools
4. Configure OpenAI Agents with tool definitions
5. Build UI with agent execution monitor
6. Generate sample fraudulent transactions (100 total, mixed fraud)
7. Test end-to-end with real-time monitoring

Tech Stack Recommendation

Layer	        Technology
Orchestrator	Python (asyncio) or Node.js (async/await)
Agents	        OpenAI Assistants API or SDK with tool use
UI	            React/Vue.js with Vite
Backend Server	Express.js or FastAPI
Real-time	    WebSocket or Server-Sent Events (SSE)
State	        JSON files + in-memory dictionary


Fraud Detection Tools (Functions the Agent can call)
Tool	                        Purpose
analyzeAmountAnomaly	        Detect unusual transaction amounts for account/merchant
checkLocationVelocity	        Detect geographically impossible transactions
evaluateMerchantRisk	        Check if merchant is known for fraud patterns
verifyDeviceConsistency	        Ensure device matches account history
recordSuspiciousTransaction	    Log flagged transaction to output file
getHistoricalContext	        Query transaction history for the account



Project Structure Setup
FraudDetectionPS6/
├── data/
│   ├── sampleData.json                 (already exists - 100 transactions)
│   └── suspiciousTransactions.json      (output file - stores flagged txns)
│
├── backend/                             (Node.js orchestrator + API)
│   ├── package.json                     (dependencies: openai, express, etc)
│   ├── orchestrator.js                  (main: batch logic + agent calls)
│   ├── fraudDetectionTools.js           (tool definitions for agents)
│   ├── agentManager.js                  (setup & config for OpenAI Agents)
│   ├── server.js                        (Express server for UI + SSE)
│   └── utils/
│       ├── batchProcessor.js            (chunks transactions into groups of 20)
│       └── stateManager.js              (reads/writes suspiciousTransactions.json)
│
├── frontend/                            (HTML/JavaScript UI)
│   ├── index.html                       (main page + styling)
│   ├── dashboard.js                     (UI logic, real-time updates via SSE)
│   └── styles.css                       (styling)
│
├── README.md                            (already exists)
├── package.json                         (root - optional, for monorepo convenience)
└── .env                                 (API keys: OPENAI_API_KEY)