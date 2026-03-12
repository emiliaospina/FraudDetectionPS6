const { OpenAI } = require('openai');
const { toolSchemas, executeTool } = require('./fraudDetectionTools');

// Initialize OpenAI client (uses OPENAI_API_KEY from environment)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL = 'gpt-4-turbo';

/**
 * Process a batch of transactions through the OpenAI Agent
 * The Agent uses tools to analyze each transaction and flag suspicious ones
 * 
 * @param {Array} transactions - Batch of up to 20 transactions to analyze
 * @returns {Promise<Object>} { successful: true/false, flaggedTransactions: [], agentThinking: [] }
 */
async function processTransactionBatch(transactions, options = {}) {
  const {
    batchNumber = null,
    batchCount = null,
    onSuspiciousDetected = () => {},
    onAgentLog = () => {}
  } = options;

  try {
    const batchLabel = batchNumber ? `Batch ${batchNumber}/${batchCount}` : 'Batch';
    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] ${batchLabel} STARTED — ${transactions.length} transactions`);
    console.log(`${'='.repeat(60)}`);

    const flaggedTransactions = [];
    const agentThinking = [];

    // Create the initial message for the Agent
    const userMessage = {
      role: 'user',
      content: `Analyze the following bank transactions for fraud indicators. For each transaction, use the available tools to check for anomalies. If you determine a transaction is fraudulent, call the recordSuspiciousTransaction tool to flag it.

Transactions to analyze:
${JSON.stringify(transactions, null, 2)}

Please analyze each transaction systematically and flag any suspicious ones.`
    };

    // Initialize messages array
    let messages = [userMessage];

    // Agentic loop: Keep processing until Agent says it's done
    let iterations = 0;
    const MAX_ITERATIONS = 10; // Prevent infinite loops

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`\n--- Agent Iteration ${iterations} ---`);
      onAgentLog({ type: 'agent_iteration', batchNumber, batchCount, iteration: iterations });

      // Call the Agent
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: messages,
        tools: toolSchemas,
        tool_choice: 'auto' // Let Agent decide if tools are needed
      });

      const choice = response.choices && response.choices[0] ? response.choices[0] : null;
      const assistantMessage = choice ? choice.message : null;
      const finishReason = choice ? choice.finish_reason : null;

      if (!assistantMessage) {
        throw new Error('Agent did not return a valid message');
      }

      messages.push(assistantMessage);

      // Log Agent's thinking
      if (assistantMessage.content) {
        console.log(`Agent: ${assistantMessage.content}`);
        agentThinking.push({
          iteration: iterations,
          content: assistantMessage.content
        });
        onAgentLog({ type: 'agent_thinking', batchNumber, batchCount, iteration: iterations, content: assistantMessage.content });
      }

      // Check if Agent is done (no more tool calls)
      if (finishReason === 'stop' && !assistantMessage.tool_calls) {
        console.log(`\nAgent completed analysis.`);
        break;
      }

      // Process tool calls if Agent made them
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`Agent called ${assistantMessage.tool_calls.length} tool(s)`);

        const toolResults = [];

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolInput = JSON.parse(toolCall.function.arguments);

          console.log(`  📤 Tool: ${toolName}`);
          console.log(`     Input: ${JSON.stringify(toolInput).substring(0, 100)}...`);
          onAgentLog({ type: 'tool_call', batchNumber, batchCount, iteration: iterations, toolName, inputPreview: JSON.stringify(toolInput).substring(0, 150) });

          // Execute the tool
          const toolResult = await executeTool(toolName, toolInput);

          console.log(`  📥 Result: ${JSON.stringify(toolResult).substring(0, 150)}...`);
          onAgentLog({ type: 'tool_result', batchNumber, batchCount, iteration: iterations, toolName, resultPreview: JSON.stringify(toolResult).substring(0, 150) });

          // Track flagged transactions
          if (
            toolName === 'recordSuspiciousTransaction' &&
            toolResult.success
          ) {
            flaggedTransactions.push(toolResult.transaction);

            // Emit rolling event as soon as a suspicious transaction is detected
            onSuspiciousDetected({
              batchNumber,
              batchCount,
              transaction: toolResult.transaction,
              reason: toolInput.reasonSummary || toolResult.transaction.flaggedReason || 'Flagged by agent'
            });
          }

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        }

        // Add tool results back to conversation for the next assistant turn
        messages.push(...toolResults);
      } else {
        // No tool calls, Agent is done
        break;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] ${batchLabel} DONE in ${elapsed}s — Flagged ${flaggedTransactions.length} transaction(s)`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      successful: true,
      flaggedTransactions,
      agentThinking,
      totalProcessed: transactions.length
    };
  } catch (error) {
    console.error('Error processing batch:', error.message);
    return {
      successful: false,
      error: error.message,
      flaggedTransactions: [],
      agentThinking: [],
      totalProcessed: transactions.length
    };
  }
}

module.exports = {
  processTransactionBatch
};
