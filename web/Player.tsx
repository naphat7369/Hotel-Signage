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
    [transitionKey, setTransitionKey] = useState(0),
    [index, setIndex] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [controls, setControls] = useState(false),
    [showIdentify, setShowIdentify] = useState(false);
  const media = useRef<HTMLImageElement | HTMLVideoElement | null>(null),
    activeItem = useRef<Row | null>(null),
    activeVersion = useRef(""),
    lastShot = useRef(0),
    started = useRef(0),
    offset = useRef(0),
    advance = useRef(false),
    prevMedia = useRef<{ item: Row; src: string; key: string } | null>(null),
    outgoingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  activeItem.current = item;
  const hasCaches = typeof window !== "undefined" && isSecureContext && "caches" in window;
  const capable = typeof window !== "undefined" && "indexedDB" in window;
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
        "Offline Player ต้องใช้ Browser ที่รองรับ IndexedDB",
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
    const onKey = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      if (e.key === "ArrowLeft" || e.key === "Left" || code === 37 || code === 21) {
        setShowIdentify(true);
      }
      if (e.key === "ArrowRight" || e.key === "Right" || e.key === "Escape" || code === 39 || code === 22 || code === 27 || code === 111) {
        setShowIdentify(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  
  useEffect(() => {
    if (showIdentify) {
      const timer = setTimeout(() => setShowIdentify(false), 15000);
      return () => clearTimeout(timer);
    }
  }, [showIdentify]);
  
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
        const cache = hasCaches ? await caches.open(cacheName) : null;
        for (const i of oldItems) {
          if (cache) {
            const r = await cache.match(cacheKey(i.media));
            if (r && Number(r.headers.get("content-length")) === i.size)
              summary.ready++;
          } else {
            summary.ready++;
          }
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
            if (cache) {
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
          if (cache) {
            const keep = new Set(files.map((f) => cacheKey(f.media)));
            for (const key of await cache.keys())
              if (!keep.has(key.url)) await cache.delete(key);
          }
        }
        const current = selectProgram(
          active,
          new Date(Date.now() + offset.current),
        );
        let playable = 0;
        for (const f of current?.items || [])
          if (cache ? await cache.match(cacheKey(f.media)) : true) playable++;
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
          if (hasCaches) await caches.delete(cacheName);
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
      prevMedia.current = null;
      if (outgoingTimer.current) {
        clearTimeout(outgoingTimer.current);
        outgoingTimer.current = null;
      }
      setItem(null);
      setSrc("");
      return;
    }
    const f = program.items[index % program.items.length];
    (hasCaches ? caches.open(cacheName).then((c) => c.match(cacheKey(f.media))) : Promise.resolve(null))
      .then(async (r) => {
        if (!r && hasCaches) {
          setError("ไฟล์ " + f.name + " หายจาก Cache");
          if (!canceled) setTimeout(() => setIndex((i) => i + 1), 2000);
          return;
        }
        let url = "";
        if (r) {
          const rawBlob = await r.blob();
          if ((await digest(rawBlob)) !== f.checksum) {
            const c = await caches.open(cacheName);
            await c.delete(cacheKey(f.media));
            throw new Error("ไฟล์เสีย กำลังรอซ่อม " + f.name);
          }
          const isVid = f.type?.startsWith("video") || f.name?.toLowerCase().endsWith(".mp4");
          const mimeType = f.type || (isVid ? "video/mp4" : "");
          const blob = rawBlob.type ? rawBlob : (mimeType ? new Blob([rawBlob], { type: mimeType }) : rawBlob);
          url = URL.createObjectURL(blob);
        } else {
          url = "/api/device/media/" + f.media + "?token=" + (credential?.token || "");
        }
        if (canceled) {
          if (r) URL.revokeObjectURL(url);
          return;
        }
        const isVid = f.type?.startsWith("video") || f.name?.toLowerCase().endsWith(".mp4");
        const itemWithNorm = { ...f, type: f.type || (isVid ? "video/mp4" : f.type) };
        setItem(itemWithNorm);
        setSrc(url);
        started.current = Date.now();

        // Step 1: capture previous media BEFORE setting current
        const prevSnapshot = prevMedia.current;

        // Step 2: clear any pending outgoing cleanup
        if (outgoingTimer.current) {
          clearTimeout(outgoingTimer.current);
          outgoingTimer.current = null;
        }

        // Step 3: set outgoing first (if there was a previous)
        if (prevSnapshot) {
          setOutgoingMedia(prevSnapshot);
        }

        // Step 4: set the new current media
        const next = { item: itemWithNorm, src: url, key: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) };
        prevMedia.current = next;
        setCurrentMedia(next);
        setTransitionKey((k) => k + 1);

        // Step 5: remove outgoing layer after animation completes
        if (prevSnapshot) {
          const speed = (Number(f.transitionSpeed) || 0.8) * 1000;
          const capturedSrc = prevSnapshot.src;
          outgoingTimer.current = setTimeout(() => {
            setOutgoingMedia((out) => {
              if (out && out.src === capturedSrc) {
                URL.revokeObjectURL(capturedSrc);
                return null;
              }
              return out;
            });
            outgoingTimer.current = null;
          }, speed + 200);
        }
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
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      media: item.media,
      count: 1,
      seconds: (Date.now() - started.current) / 1000,
      last: Date.now() + offset.current,
    }).catch((e) => setError("บันทึกยอดไม่สำเร็จ: " + e.message));
    setIndex((i) => i + 1);
  }
  const isCurrentVideo = item?.type?.startsWith("video") || item?.name?.toLowerCase().endsWith(".mp4");
  useEffect(() => {
    if (!item || isCurrentVideo || !src) return;
    const t = setTimeout(complete, (Number(item.duration) || 10) * 1000);
    return () => clearTimeout(t);
  }, [item, src, isCurrentVideo]);
  useEffect(() => {
    if (!isCurrentVideo) return;
    const watchdog = setTimeout(
      () => {
        setError("วิดีโอค้างหรือเล่นไม่จบ ข้ามไปสื่อถัดไป");
        setIndex((i) => i + 1);
      },
      3600000,
    );
    return () => clearTimeout(watchdog);
  }, [item, isCurrentVideo]);
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
      <div
        className="controls-trigger"
        onClick={() => setControls(!controls)}
      />
      {showIdentify && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: "350px",
            backgroundColor: "rgba(0,0,0,0.85)",
            color: "white",
            zIndex: 9999,
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            boxSizing: "border-box",
            borderRight: "2px solid #00897d",
            animation: "slideInLeft 0.3s ease-out",
          }}
        >
          <style>{`
            @keyframes slideInLeft {
              from { transform: translateX(-100%); }
              to { transform: translateX(0); }
            }
          `}</style>
          <h2 style={{ fontSize: "2rem", marginBottom: "1rem", color: "#00897d" }}>ข้อมูลจอแสดงผล</h2>
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "1rem", color: "#94a3b8" }}>ชื่อจอ (Name)</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{manifest?.name || "ไม่ทราบชื่อ"}</div>
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "1rem", color: "#94a3b8" }}>รหัสอุปกรณ์ (ID)</div>
            <div style={{ fontSize: "1.2rem", wordBreak: "break-all" }}>{credential?.device || "N/A"}</div>
          </div>
          <div style={{ marginTop: "auto", fontSize: "0.9rem", color: "#64748b" }}>
            กดลูกศรขวาเพื่อปิด
          </div>
        </div>
      )}
      {currentMedia ? (
        <div className="player-stage">
          {outgoingMedia && (
            <div
              key={outgoingMedia.key}
              className={`slide-layer anim-outgoing transition-${outgoingMedia.item.transition || currentMedia.item.transition || "fade"}`}
              style={
                {
                  "--transition-speed": `${outgoingMedia.item.transitionSpeed || currentMedia.item.transitionSpeed || 0.8}s`,
                } as React.CSSProperties
              }
            >
              {outgoingMedia.item.type?.startsWith("video") || outgoingMedia.item.name?.toLowerCase().endsWith(".mp4") ? (
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
            {currentMedia.item.type?.startsWith("video") || currentMedia.item.name?.toLowerCase().endsWith(".mp4") ? (
              <video
                ref={(e) => {
                  media.current = e;
                  if (e) {
                    e.play().catch((err) => {
                      console.warn("[Player Video Autoplay Blocked]", err);
                    });
                  }
                }}
                src={currentMedia.src}
                autoPlay
                muted
                playsInline
                onEnded={complete}
                onError={(e) => {
                  const mediaErr = (e.target as HTMLVideoElement)?.error;
                  const code = mediaErr?.code;
                  const codeMsg =
                    code === 4
                      ? "รูปแบบไฟล์/Codec ไม่รองรับบนอุปกรณ์นี้ (แนะนำใช้ MP4 H.264)"
                      : code === 3
                        ? "ไม่สามารถ Decode วิดีโอได้ (อาจเป็น H.265 หรือความละเอียดสูงเกินไป)"
                        : code === 2
                          ? "เครือข่ายขัดข้องระหว่างดึงวิดีโอ"
                          : "เกิดข้อผิดพลาดในการเล่น";
                  console.error(
                    `[Player Video Error] "${currentMedia.item.name}":`,
                    mediaErr,
                  );
                  setError(
                    `เล่นวิดีโอ "${currentMedia.item.name}" ไม่ได้: ${codeMsg}`,
                  );
                  setTimeout(() => setIndex((i) => i + 1), 4000);
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
