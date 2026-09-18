export async function api(path: string, body?: unknown, org?: string, method?: string) {
  const url =
    "/api" +
    path +
    (org ? (path.includes("?") ? "&" : "?") + "org=" + encodeURIComponent(org) : "");
  
  const fetchMethod = method || (body === undefined ? "GET" : "POST");
  const options: RequestInit = {
    method: fetchMethod,
    ...(fetchMethod === "GET" ? { cache: "no-store" } : {}),
  };

  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  const r = await fetch(url, options);
  let data: any;
  try {
    data = await r.json();
  } catch {
    data = { error: `ข้อผิดพลาด HTTP ${r.status}` };
  }
  if (!r.ok) {
    console.error(`[API Error] HTTP ${r.status} on ${url}:`, data);
    throw new Error(data.error || `ไม่สามารถทำรายการได้ (${r.status})`);
  }
  return data;
}
export const when=(n:number)=>n?new Date(n).toLocaleString('th-TH'):'ยังไม่มีข้อมูล';
export const size=(n:number)=>n>1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(1)+' MB';
