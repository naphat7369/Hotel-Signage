let opening: Promise<IDBDatabase> | null = null;
function db() {
  return (opening ??= new Promise<IDBDatabase>((ok, no) => {
    const r = indexedDB.open("stayscreen-player", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  }));
}
export async function read<T = any>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((ok, no) => {
    const t = d.transaction("state");
    const r = t.objectStore("state").get(key);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
export async function write(key: string, value: any) {
  const d = await db();
  return new Promise<void>((ok, no) => {
    const t = d.transaction("state", "readwrite");
    t.objectStore("state").put(value, key);
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
  });
}
export async function enqueue(item: any) {
  const d = await db();
  return new Promise<void>((ok, no) => {
    const t = d.transaction("state", "readwrite"),
      s = t.objectStore("state"),
      r = s.get("plays");
    r.onsuccess = () =>
      s.put([...(r.result || []), item].slice(-10000), "plays");
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
  });
}
export async function acknowledge(ids: string[]) {
  const d = await db();
  return new Promise<void>((ok, no) => {
    const t = d.transaction("state", "readwrite"),
      s = t.objectStore("state"),
      r = s.get("plays");
    r.onsuccess = () =>
      s.put(
        (r.result || []).filter((i: any) => !ids.includes(i.id)),
        "plays",
      );
    t.oncomplete = () => ok();
    t.onerror = () => no(t.error);
  });
}
export async function digest(blob: Blob) {
  const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export const cacheName = "stayscreen-media-v1";
export const cacheKey = (id: string) =>
  new URL("/offline-media/" + id, location.origin).href;
