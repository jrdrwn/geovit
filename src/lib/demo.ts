import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
export type DemoData = {
  visits: { location_id: string; visitor_id: string }[];
  comments: {
    id: string;
    location_id: string;
    visitor_id: string;
    name: string;
    comment: string;
    status: string;
    created_at: string;
  }[];
};
const file = path.join(process.cwd(), ".data", "demo.json");
export async function readDemo(): Promise<DemoData> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { visits: [], comments: [] };
  }
}
let queue: Promise<unknown> = Promise.resolve();
export function updateDemo(fn: (data: DemoData) => void) {
  const task = queue.then(async () => {
    const data = await readDemo();
    fn(data);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file + ".tmp", JSON.stringify(data));
    await rename(file + ".tmp", file);
  });
  queue = task.catch(() => {});
  return task;
}
