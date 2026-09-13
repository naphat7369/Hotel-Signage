import { useEffect, useRef, useState } from "react";
import { Monitor, RefreshCw, Maximize } from "lucide-react";
import { selectProgram } from "../shared/schedule.mjs";
import {
  read,
  write,
  enqueue,
  acknowledge,
  digest,
  cacheName,
  cacheKey,
} from "./offline";
type Row = Record<string, any>;
export default function Player() {
  const [credential, setCredential] = useState<Row | null>(null),
    [pair, setPair] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("กำลังเปิด Player"),
    [manifest, setManifest] = useState<Row | null>(null),
    [item, setItem] = useState<Row | null>(null),
    [src, setSrc] = useState(""),
    [currentMedia, setCurrentMedia] = useState<{ item: Row; src: string; key: string } | null>(null),
    [outgoingMedia, setOutgoingMedia] = useState<{ item: Row; src: string; key: string } | null>(null),
    [index, setIndex] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [controls, setControls] = useState(false);
  const media = useRef<HTMLImageElement | HTMLVideoElement | null>(null),
    activeItem = useRef<Row | null>(null),
    activeVersion = useRef(""),
    lastShot = useRef(0),
    started = useRef(0),
    offset = useRef(0),
    advance = useRef(false);
  activeItem.current = item;
  const capable =
    typeof window !== "undefined" &&
    isSecureContext &&
    "caches" in window &&
    "indexedDB" in window;
  async function request(path: string, body?: any, key = credential?.token) {
    const r = await fetch("/api" + path, {
      headers: {
        ...(key ? { Authorization: "Bearer " + key } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const b = await r.json();
    if (!r.ok) throw Object.assign(new Error(b.error), { status: r.status });
    return b;
  }
  useEffect(() => {
    if (!capable) {
      setError(
        "Offline Player ต้องใช้ HTTPS หรือ localhost และ Browser ที่รองรับ Cache Storage",
      );
      return;
    }
    navigator.serviceWorker
      ?.register("/sw.js")
      .catch((e) => setError("ติดตั้ง Offline app ไม่สำเร็จ: " + e.message));
    Promise.all([read("credential"), read("manifest")])
      .then(([c, m]) => {
        if (c) setCredential(c);
        if (c && m) setManifest(m);
        if (!c) setStatus("ยังไม่ได้ลงทะเบียนจอ");
      })
      .catch((e) => setError("อ่านข้อมูล Player ไม่สำเร็จ: " + e.message));
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  async function beginPair() {
    try {
      setError("");
      const p = await request("/pair/start", {});
      setPair(p);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (!pair) return;
    let busy = false;
    const t = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const c = await request("/pair/status", { secret: pair.secret });
        if (!c.pending) {
          await write("credential", c);
          setCredential(c);
          setPair(null);
        }
      } catch (e: any) {
        setError(e.message);
        if (e.status === 410) setPair(null);
      } finally {
        busy = false;
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pair]);
  useEffect(() => {
    if (!credential || !capable) return;
    const deviceToken = credential.token;
    let stopped = false,
      busy = false;
    async function sync() {
      if (busy || stopped) return;
      busy = true;
      let active = await read("manifest");
      let health = "UNKNOWN",
        summary = { total: 0, ready: 0 },
        problem = "";
      try {
        const cache = await caches.open(cacheName);
        const allItems = (m: any) => {
          const map = new Map<string, Row>();
          for (const p of [
            m?.fallback,
            ...(m?.schedules || []).map((s: any) => s.snapshot),
          ].filter(Boolean))
            for (const i of p.items) map.set(i.media, i);
          return [...map.values()];
        };
        // Detect eviction from the active program before trying network; never claim offline readiness from the manifest alone.
        const oldItems = allItems(active);
        summary.total = oldItems.length;
        for (const i of oldItems) {
          const r = await cache.match(cacheKey(i.media));
          if (r && Number(r.headers.get("content-length")) === i.size)
            summary.ready++;
        }
        health =
          summary.total === summary.ready && summary.total > 0
            ? "HEALTHY"
            : summary.ready
              ? "DEGRADED"
              : "CRITICAL";
        if (summary.ready < summary.total) {
          problem = "ไฟล์ Cache หาย กำลังดาวน์โหลดซ่อม";
          try {
            await request("/device/heartbeat", {
              health,
              cache: summary,
              error: problem,
              capabilities: { offline: true, screenshot: true },
            });
          } catch {
            /* Offline failures are retried on the next tick. */
          }
        }
        let candidate = active;
        try {
          candidate = await request("/device/manifest");
          offset.current = candidate.serverTime - Date.now();
        } catch (e: any) {
          if (e.status === 401) throw e;
          problem = problem || "ขาดการเชื่อมต่อเซิร์ฟเวอร์";
        }
        if (!candidate) {
          setStatus("รอรับ Playlist จากเซิร์ฟเวอร์");
          return;
        }
        const files = allItems(candidate);
        summary = { total: files.length, ready: 0 };
        for (const f of files) {
          if (stopped) return;
          try {
            let cached = await cache.match(cacheKey(f.media));
            if (
              cached &&
              (Number(cached.headers.get("content-length")) !== f.size ||
                cached.headers.get("x-checksum") !== f.checksum)
            ) {
              await cache.delete(cacheKey(f.media));
              cached = undefined;
            }
            if (!cached) {
              const r = await fetch("/api/device/media/" + f.media, {
                headers: { Authorization: "Bearer " + deviceToken },
              });
              if (r.status === 401)
                throw Object.assign(new Error("จอถูกยกเลิกสิทธิ์"), {
                  status: 401,
                });
              if (!r.ok) throw new Error("ดาวน์โหลด " + f.name + " ไม่สำเร็จ");
              const blob = await r.blob();
              if (blob.size !== f.size || (await digest(blob)) !== f.checksum)
                throw new Error("Checksum ไม่ตรง: " + f.name);
              await cache.put(
                cacheKey(f.media),
                new Response(blob, {
                  headers: {
                    "Content-Type": f.type,
                    "Content-Length": String(f.size),
                    "X-Checksum": f.checksum,
                  },
                }),
              );
            }
            summary.ready++;
          } catch (e: any) {
            if (e.status === 401) throw e;
            problem = e.message;
          }
        }
        if (summary.ready === summary.total) {
          await write("manifest", candidate);
          active = candidate;
          if (!stopped) setManifest(candidate);
          const keep = new Set(files.map((f) => cacheKey(f.media)));
          for (const key of await cache.keys())
            if (!keep.has(key.url)) await cache.delete(key);
        }
        const current = selectProgram(
          active,
          new Date(Date.now() + offset.current),
        );
        let playable = 0;
        for (const f of current?.items || [])
          if (await cache.match(cacheKey(f.media))) playable++;
        health = !playable
          ? "CRITICAL"
          : summary.ready < summary.total
            ? "DEGRADED"
            : "HEALTHY";
        const estimate = await navigator.storage.estimate();
        const persistent = await navigator.storage.persisted();
        const hb = await request("/device/heartbeat", {
          health,
          cache: {
            ...summary,
            used: estimate.usage,
            quota: estimate.quota,
            persistent,
          },
          error: problem,
          current: activeItem.current
            ? {
                media: activeItem.current.media,
                version: activeVersion.current,
              }
            : null,
          revision: active?.revision,
          capabilities: {
            offline: true,
            screenshot: true,
            autoStart: false,
            player: "Web",
            browser: navigator.userAgent,
          },
        });
        offset.current = hb.serverTime - Date.now();
        setStatus(
          health === "HEALTHY"
            ? "พร้อมเล่นออฟไลน์"
            : problem || "รอ Schedule ที่พร้อมเล่น",
        );
        setError(problem);
        const queue = ((await read<Row[]>("plays")) || []).slice(0, 200);
        if (queue.length) {
          await request("/device/plays", { items: queue });
          await acknowledge(queue.map((i) => i.id));
        }
        if (hb.screenshotRequested || Date.now() - lastShot.current > 300000) {
          const el = media.current;
          if (el && activeItem.current) {
            const c = document.createElement("canvas");
            c.width = 960;
            c.height = 540;
            const ctx = c.getContext("2d")!;
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, c.width, c.height);
            const w =
                el instanceof HTMLVideoElement
                  ? el.videoWidth
                  : el.naturalWidth,
              h =
                el instanceof HTMLVideoElement
                  ? el.videoHeight
                  : el.naturalHeight;
            if (w && h) {
              const scale = Math.min(c.width / w, c.height / h);
              ctx.drawImage(
                el,
                (c.width - w * scale) / 2,
                (c.height - h * scale) / 2,
                w * scale,
                h * scale,
              );
              const blob = await new Promise<Blob | null>((ok) =>
                c.toBlob(ok, "image/jpeg", 0.75),
              );
              if (blob) {
                const r = await fetch(
                  `/api/device/screenshot?media=${activeItem.current.media}&version=${activeVersion.current}`,
                  {
                    method: "POST",
                    headers: { Authorization: "Bearer " + deviceToken },
                    body: blob,
                  },
                );
                if (r.ok) lastShot.current = Date.now();
              }
            }
          }
        }
      } catch (e: any) {
        setError(e.message);
        if (e.status === 401) {
          await write("credential", null);
          await write("manifest", null);
          await caches.delete(cacheName);
          setCredential(null);
          setManifest(null);
          setSrc("");
          setStatus("จอถูกยกเลิกสิทธิ์ กรุณาจับคู่ใหม่");
        }
      } finally {
        busy = false;
      }
    }
    sync();
    const t = setInterval(sync, 30000);
    const online = () => sync();
    window.addEventListener("online", online);
    return () => {
      stopped = true;
      clearInterval(t);
      window.removeEventListener("online", online);
    };
  }, [credential]);
  const program = manifest
    ? selectProgram(manifest, new Date(clock + offset.current))
    : null;
  const programID = program?.id || "";
  activeVersion.current = programID;
  useEffect(() => {
    setIndex(0);
  }, [programID]);
  useEffect(() => {
    let canceled = false,
      url = "";
    advance.current = false;
    if (!program?.items.length) {
      setCurrentMedia(null);
      setOutgoingMedia(null);
      setItem(null);
      setSrc("");
      return;
    }
    const f = program.items[index % program.items.length];
    caches
      .open(cacheName)
      .then((c) => c.match(cacheKey(f.media)))
      .then(async (r) => {
        if (!r) {
          setError("ไฟล์ " + f.name + " หายจาก Cache");
          if (!canceled) setTimeout(() => setIndex((i) => i + 1), 2000);
          return;
        }
        const blob = await r.blob();
        if ((await digest(blob)) !== f.checksum) {
          const c = await caches.open(cacheName);
          await c.delete(cacheKey(f.media));
          throw new Error("ไฟล์เสีย กำลังรอซ่อม " + f.name);
        }
        url = URL.createObjectURL(blob);
        if (canceled) {
          URL.revokeObjectURL(url);
          return;
        }
        setItem(f);
        setSrc(url);
        started.current = Date.now();
        setCurrentMedia((prev) => {
          if (prev) {
            setOutgoingMedia(prev);
            const speed = (Number(f.transitionSpeed) || 0.8) * 1000;
            setTimeout(() => {
              setOutgoingMedia((out) => {
                if (out && out.src === prev.src) {
                  URL.revokeObjectURL(out.src);
                  return null;
                }
                return out;
              });
            }, speed + 100);
          }
          return { item: f, src: url, key: crypto.randomUUID() };
        });
      })
      .catch((e) => {
        setError(e.message);
        if (!canceled) setTimeout(() => setIndex((i) => i + 1), 2000);
      });
    return () => {
      canceled = true;
    };
  }, [programID, index]);
  function complete() {
    if (!item || advance.current) return;
    advance.current = true;
    enqueue({
      id: crypto.randomUUID(),
      media: item.media,
      count: 1,
      seconds: (Date.now() - started.current) / 1000,
      last: Date.now() + offset.current,
    }).catch((e) => setError("บันทึกยอดไม่สำเร็จ: " + e.message));
    setIndex((i) => i + 1);
  }
  useEffect(() => {
    if (!item || item.type.startsWith("video") || !src) return;
    const t = setTimeout(complete, item.duration * 1000);
    return () => clearTimeout(t);
  }, [item, src]);
  useEffect(() => {
    if (!item?.type.startsWith("video")) return;
    const watchdog = setTimeout(
      () => {
        setError("วิดีโอเล่นไม่จบ ข้ามไปสื่อถัดไป");
        setIndex((i) => i + 1);
      },
      Math.max(3600000, (item.duration + 60) * 1000),
    );
    return () => clearTimeout(watchdog);
  }, [item]);
  if (!credential)
    return (
      <main className="player-setup">
        <Monitor size={50} />
        <h1>Shotel Player</h1>
        <p>{status}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {pair ? (
          <>
            <p>นำรหัสนี้ไปลงทะเบียนใน Manage Displays</p>
            <div className="pair-code">{pair.code}</div>
            <p>หมดอายุ {new Date(pair.expires).toLocaleTimeString("th-TH")}</p>
          </>
        ) : (
          <button className="primary" disabled={!capable} onClick={beginPair}>
            สร้างรหัสจับคู่จอนี้
          </button>
        )}
        <a href="/">กลับหน้า CMS</a>
      </main>
    );
  return (
    <main className="player" onDoubleClick={() => setControls((v) => !v)}>
      {currentMedia ? (
        <div className="player-stage">
          {outgoingMedia && (
            <div
              key={outgoingMedia.key}
              className={`slide-layer anim-outgoing transition-${currentMedia.item.transition || "fade"}`}
              style={
                {
                  "--transition-speed": `${currentMedia.item.transitionSpeed || 0.8}s`,
                } as React.CSSProperties
              }
            >
              {outgoingMedia.item.type?.startsWith("video") ? (
                <video src={outgoingMedia.src} muted autoPlay playsInline />
              ) : (
                <img src={outgoingMedia.src} alt="" />
              )}
            </div>
          )}
          <div
            key={currentMedia.key}
            className={`slide-layer anim-incoming transition-${currentMedia.item.transition || "fade"}`}
            style={
              {
                "--transition-speed": `${currentMedia.item.transitionSpeed || 0.8}s`,
              } as React.CSSProperties
            }
          >
            {currentMedia.item.type?.startsWith("video") ? (
              <video
                ref={(e) => {
                  media.current = e;
                }}
                src={currentMedia.src}
                autoPlay
                muted
                playsInline
                onEnded={complete}
                onError={() => {
                  setError("Browser เล่นวิดีโอนี้ไม่ได้");
                  setIndex((i) => i + 1);
                }}
              />
            ) : (
              <img
                ref={(e) => {
                  media.current = e;
                }}
                src={currentMedia.src}
                alt={currentMedia.item.name}
                onError={() => setIndex((i) => i + 1)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="player-wait">
          <Monitor size={40} />
          <h2>{manifest?.name || "Shotel"}</h2>
          <p>{status}</p>
          {error && <p>{error}</p>}
          <small>แตะสองครั้งเพื่อเปิดเครื่องมือ</small>
        </div>
      )}
      {controls && (
        <div className="player-controls">
          <p>
            {manifest?.name} · {status}
          </p>
          <p>{error}</p>
          <button
            onClick={() =>
              document.documentElement
                .requestFullscreen()
                .catch((e) => setError(e.message))
            }
          >
            <Maximize size={18} /> เต็มจอ
          </button>
          <button
            onClick={() =>
              navigator.storage
                .persist()
                .then((p) =>
                  setStatus(
                    p
                      ? "ได้รับสิทธิ์เก็บไฟล์ถาวร"
                      : "Browser ไม่อนุญาตให้เก็บไฟล์ถาวร",
                  ),
                )
            }
          >
            ขอพื้นที่เก็บถาวร
          </button>
          <button onClick={() => setControls(false)}>ซ่อนเครื่องมือ</button>
          <a href="/">CMS</a>
        </div>
      )}
    </main>
  );
}
