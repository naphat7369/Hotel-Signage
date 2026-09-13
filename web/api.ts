export async function api(path:string, body?:unknown, org?:string) {
 const url='/api'+path+(org?(path.includes('?')?'&':'?')+'org='+encodeURIComponent(org):'');
 const r=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');return data;
}
export const when=(n:number)=>n?new Date(n).toLocaleString('th-TH'):'ยังไม่มีข้อมูล';
export const size=(n:number)=>n>1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(1)+' MB';
