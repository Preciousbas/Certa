import { createMemoryDatabase } from "./client.js";
import { seedDemo } from "./seed.js";

process.env.DEMO_MODE ??= "1";
const opened = await createMemoryDatabase();
const result = await seedDemo(opened.db);
console.log(result);
await opened.close();
