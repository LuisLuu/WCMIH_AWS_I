
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

export async function createPostgresCheckpointer() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const checkpointer = PostgresSaver.fromConnString(
    databaseUrl
  );

  await checkpointer.setup();

  return checkpointer;
}
