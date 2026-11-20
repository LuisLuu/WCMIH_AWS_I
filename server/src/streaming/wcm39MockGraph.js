
import { setTimeout as sleep } from "node:timers/promises";

// Local integration fixture only.
// Not a production LangGraph runtime.
export const wcm39MockGraph = {
  async *stream(input, config) {
    const signal = config.signal;

    await sleep(150, undefined, { signal });

    yield {
      supervisor_node: {
        status: "routed"
      }
    };

    await sleep(150, undefined, { signal });

    yield {
      specialist_node: {
        status: "completed"
      }
    };
  }
};
