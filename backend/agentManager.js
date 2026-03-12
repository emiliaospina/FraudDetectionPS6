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
async function processTransactionBatch(transactions) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing batch of ${transactions.length} transactions`);
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

      // Call the Agent
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: messages,
        tools: toolSchemas,
        tool_choice: 'auto' // Let Agent decide if tools are needed
      });

      const assistantMessage = response.message;
      messages.push(assistantMessage);

      // Log Agent's thinking
      if (assistantMessage.content) {
        console.log(`Agent: ${assistantMessage.content}`);
        agentThinking.push({
          iteration: iterations,
          content: assistantMessage.content
        });
      }

      // Check if Agent is done (no more tool calls)
      if (response.stop_reason === 'end_turn' || !assistantMessage.tool_calls) {
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

          // Execute the tool
          const toolResult = await executeTool(toolName, toolInput);

          console.log(`  📥 Result: ${JSON.stringify(toolResult).substring(0, 150)}...`);

          // Track flagged transactions
          if (
            toolName === 'recordSuspiciousTransaction' &&
            toolResult.success
          ) {
            flaggedTransactions.push(toolResult.transaction);
          }

          toolResults.push({
            tool_use_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        }

        // Add tool results back to conversation
        const toolResultMessage = {
          role: 'user',
          content: toolResults.map(tr => ({
            type: 'tool_result',
            tool_use_id: tr.tool_use_id,
            content: tr.content
          }))
        };

        messages.push(toolResultMessage);
      } else {
        // No tool calls, Agent is done
        break;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Batch complete: Flagged ${flaggedTransactions.length} transaction(s)`);
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
      agentThinking: []
    };
  }
}

module.exports = {
  processTransactionBatch
};
