// A mock LangGraph object to test the WCM-28 checkpoint API
export const graph = {
  updateState: async (config, values, node) => {
    console.log('\n--- [MOCK GRAPH STATE UPDATE] ---');
    console.log(`Thread ID: ${config.configurable.thread_id}`);
    console.log(`Updated Node: ${node}`);
    console.log(`Injected Values:`, values);
    console.log('---------------------------------\n');
    return true;
  },
  
  stream: async (input, config) => {
    console.log(`[MOCK GRAPH] Simulating stream continuation...`);
    return []; // Returns empty stream for mock
  }
};