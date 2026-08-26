import './env';
import { PrismaClient } from '@prisma/client';

// Direct DB handle used ONLY for verifying what the UI/API produced —
// tests assert through the UI, then cross-check the row Prisma sees, per
// the "setup through the API, assert through the UI" + "own your data"
// rules. Also used to clean up rows a test created.
export const prisma = new PrismaClient();
