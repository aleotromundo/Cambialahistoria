import { loadContent } from '../../sim/content/content.ts';
import { answerSearch, readSearchRequest } from './build-search.ts';

function main(): void {
  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk: Buffer): void => {
    chunks.push(chunk);
  });
  process.stdin.on('end', (): void => {
    try {
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      process.stdout.write(`${JSON.stringify(answerSearch(loadContent(), readSearchRequest(raw)))}\n`);
    }
    catch (error: unknown) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  });
}

main();
