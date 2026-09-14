import http from "node:http";
import https from "node:https";
import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  appendFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = resolve(process.env.DATA_DIR || join(root, "data"));
mkdirSync(join(home, "media"), { recursive: true });
mkdirSync(join(home, "screens"), { recursive: true });
const db = new DatabaseSync(join(home, "signage.sqlite"));
db.exec(readFileSync(join(root, "server/schema.sql"), "utf8"));
const all = (q, ...p) => db.prepare(q).all(...p),
  one = (q, ...p) => db.prepare(q).get(...p),
  run = (q, ...p) => db.prepare(q).run(...p);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const str = (v, max = 200) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(400, "ข้อมูลข้อความไม่ถูกต้อง");
  return v.trim();
};
const now = () => Date.now();

export function logError(tag, req, err, extra = null) {
  const timestamp = new Date().toISOString();
  const method = req?.method || "";
  const url = req?.url || "";
  const ip = req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "unknown";
  const status = err?.status || (err?.code ? err.code : 500);
  const msg = err?.message || String(err);
  const extraStr = extra ? ` | Details: ${typeof extra === "object" ? JSON.stringify(extra) : extra}` : "";
  const stackStr = err?.stack ? `\nStack: ${err.stack}` : "";
  const line = `[${timestamp}] [ERROR] [${tag}] [Status: ${status}] ${method} ${url} (IP: ${ip})${extraStr} - ${msg}${stackStr}\n`;

  console.error(line.trimEnd());
  try {
    appendFileSync(join(home, "error.log"), line, "utf8");
  } catch (fsErr) {
    console.error("[LOGGER_WRITE_FAILED] Could not write to error.log:", fsErr);
  }
}

export function logInfo(tag, reqOrMsg, extra = null) {
  const timestamp = new Date().toISOString();
  let line;
  if (typeof reqOrMsg === "object" && reqOrMsg?.method) {
    const req = reqOrMsg;
    const ip = req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const extraStr = extra ? ` | Details: ${typeof extra === "object" ? JSON.stringify(extra) : extra}` : "";
    line = `[${timestamp}] [INFO] [${tag}] ${req.method} ${req.url} (IP: ${ip})${extraStr}\n`;
  } else {
    const msg = String(reqOrMsg);
    const extraStr = extra ? ` | Details: ${typeof extra === "object" ? JSON.stringify(extra) : extra}` : "";
    line = `[${timestamp}] [INFO] [${tag}] ${msg}${extraStr}\n`;
  }
  console.log(line.trimEnd());
  try {
    appendFileSync(join(home, "error.log"), line, "utf8");
  } catch {}
}
function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function entity(id, kind) {
  const e = one("SELECT * FROM entities WHERE id=?", id);
  if (!e || (kind && e.kind !== kind)) fail(404, "ไม่พบข้อมูล");
  return {
    ...e,
    ...JSON.parse(e.data),
    id: e.id,
    org: e.org,
    branch: e.branch,
    kind: e.kind,
  };
}
function put(kind, org, branch, data, id = randomUUID()) {
  const n = now();
  run(
    "INSERT INTO entities VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated,branch=excluded.branch",
    id,
    kind,
    org,
    branch,
    JSON.stringify(data),
    n,
    n,
  );
  return entity(id);
}
function check(u, e) {
  if (u.role === "platform") return;
  if (e.org !== u.org || (u.role === "branch" && e.branch !== u.branch))
    fail(403, "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
}
function rows(u, kind, org) {
  return all("SELECT id FROM entities WHERE kind=? AND org=?", kind, org)
    .map((r) => entity(r.id))
    .filter((e) => u.role !== "branch" || e.branch === u.branch);
}
function scope(u, org) {
  if (u.role !== "platform" && u.org !== org) fail(403, "องค์กรไม่ถูกต้อง");
  entity(org, "organizations");
}
function admin(u) {
  if (u.role === "branch") fail(403, "ต้องใช้สิทธิ์ผู้ดูแลองค์กร");
}
function audit(u, action, e) {
  run(
    "INSERT INTO audit VALUES(?,?,?,?,?,?,?)",
    randomUUID(),
    e.org || u.org,
    e.branch || "",
    u.id,
    action,
    e.id,
    now(),
  );
}
function cleanUser(u) {
  const { hash, ...safe } = u;
  return safe;
}
function password(p) {
  str(p, 200);
  if (p.length < 12) fail(400, "รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร");
  const salt = token();
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
}
function match(p, hash) {
  if (typeof p !== "string" || p.length > 200) return false;
  const [salt, digest] = hash.split(":");
  return timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(digest, "hex"));
}
function seedAdminIfEmpty() {
  const userCount = one("SELECT count(*) as count FROM users")?.count || 0;
  if (userCount === 0) {
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@shotel.com").toLowerCase().trim();
    const adminPass = process.env.ADMIN_PASSWORD || "admin12345678";
    const adminName = process.env.ADMIN_NAME || "Shotel Administrator";
    const orgName = process.env.ORG_NAME || "Shotel Hotel";
    const branchName = process.env.BRANCH_NAME || "สาขาหลัก (Main Branch)";

    const orgId = randomUUID();
    const branchId = randomUUID();
    const userId = randomUUID();

    tx(() => {
      put("organizations", orgId, "", { name: orgName, quota: 10 * 1024 ** 3 }, orgId);
      put("branches", orgId, branchId, { name: branchName, timezone: "Asia/Bangkok" }, branchId);
      run(
        "INSERT INTO users VALUES(?,?,?,?,?,?,?,?)",
        userId,
        adminEmail,
        adminName,
        "platform",
        orgId,
        "",
        password(adminPass),
        now(),
      );
    });
    console.log(`[Shotel Admin] Seeded default administrator: ${adminEmail} (password: ${adminPass})`);
  }
  if (process.env.RESET_ADMIN_PASSWORD && process.env.ADMIN_EMAIL) {
    const targetEmail = process.env.ADMIN_EMAIL.toLowerCase().trim();
    const newPass = process.env.RESET_ADMIN_PASSWORD;
    const existing = one("SELECT id FROM users WHERE email=?", targetEmail);
    if (existing) {
      run("UPDATE users SET hash=? WHERE id=?", password(newPass), existing.id);
      console.log(`[Shotel Admin] Updated password for ${targetEmail} from RESET_ADMIN_PASSWORD`);
    }
  }
}
if (process.env.NODE_ENV !== "test") {
  seedAdminIfEmpty();
}
function user(req) {
  const sid = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="))
    ?.slice(8);
  const u =
    sid &&
    one(
      "SELECT u.* FROM users u JOIN sessions s ON s.user=u.id WHERE s.hash=? AND s.expires>?",
      sha(sid),
      now(),
    );
  if (!u) fail(401, "กรุณาเข้าสู่ระบบ");
  return u;
}
function device(req) {
  const key = req.headers.authorization?.replace(/^Bearer /, "");
  const r = key && one("SELECT device FROM device_keys WHERE hash=?", sha(key));
  if (!r) fail(401, "จอยังไม่ได้จับคู่หรือถูกยกเลิกแล้ว");
  const d = entity(r.device, "displays");
  if (d.revoked) fail(401, "จอถูกยกเลิกแล้ว");
  return d;
}
async function json(req, limit = 1024 * 1024) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    fail(415, "ต้องส่ง application/json");
  let n = 0,
    chunks = [];
  for await (const c of req) {
    n += c.length;
    if (n > limit) fail(413, "ข้อมูลใหญ่เกินขนาด");
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    fail(400, "JSON ไม่ถูกต้อง");
  }
}
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const rate = new Map();
function throttle(req, label, max) {
  const key = label + req.socket.remoteAddress;
  const item = rate.get(key) || { count: 0, until: now() + 60000 };
  if (item.until < now()) {
    item.count = 0;
    item.until = now() + 60000;
  }
  item.count++;
  rate.set(key, item);
  if (item.count > max) fail(429, "ลองอีกครั้งใน 1 นาที");
}
function branchCheck(u, org, id) {
  const b = entity(id, "branches");
  check(u, b);
  if (b.org !== org) fail(400, "สาขาอยู่คนละองค์กร");
  return b;
}
function snapshot(u, id) {
  const p = entity(id);
  check(u, p);
  if (p.kind === "versions") return p;
  if (!p.published) fail(400, "กรุณา Publish Layout ก่อน");
  return entity(p.published, "versions");
}
function manifest(d) {
  const schedules = all(
    "SELECT id FROM entities WHERE kind='schedules' AND org=?",
    d.org,
  )
    .map((r) => entity(r.id))
    .filter(
      (s) =>
        s.state === "published" &&
        (s.targets.includes(d.id) ||
          (s.targetType === "branch" && s.branch === d.branch) ||
          (s.targetType === "group" &&
            s.group === d.group &&
            s.branch === d.branch) ||
          s.targetType === "organization"),
    )
    .map((s) => ({
      ...s,
      snapshot: entity(s.version, "versions"),
      specificity: { display: 4, group: 3, branch: 2, organization: 1 }[
        s.targetType
      ],
    }));
  const b = entity(d.branch, "branches");
  const fallbackId = d.fallback || b.fallback;
  const fallback = fallbackId ? entity(fallbackId, "versions") : null;
  return {
    device: d.id,
    name: d.name,
    timezone: b.timezone,
    schedules,
    fallback,
    serverTime: now(),
    revision: sha(JSON.stringify([schedules, fallback])).slice(0, 20),
  };
}
function allowedMedia(d, id) {
  const m = manifest(d);
  return [m.fallback, ...m.schedules.map((s) => s.snapshot)]
    .filter(Boolean)
    .some((s) => s.items.some((i) => i.media === id));
}
function mediaRefs(id) {
  return all(
    "SELECT id,data FROM entities WHERE kind IN ('playlists','versions')",
  ).filter((r) => JSON.parse(r.data).items?.some((i) => i.media === id));
}
async function receiveFile(req, path, max, declared = 0) {
  let size = 0;
  let head = Buffer.alloc(0);
  const hash = createHash("sha256");
  const ws = createWriteStream(path, { flags: "w" });

  logInfo("RECEIVE_START", req, { path, declared, max });

  return new Promise((resolve, reject) => {
    let finished = false;
    let lastChunkTime = Date.now();

    const watchdog = setInterval(() => {
      if (finished) return;
      if (Date.now() - lastChunkTime > 30000) {
        clearInterval(watchdog);
        const err = Object.assign(
          new Error(
            `การส่งไฟล์ขาดการเชื่อมต่อนานเกินไป (Stalled: ได้รับ ${size}/${declared} bytes, ค้างนานเกิน 30s)`,
          ),
          { status: 408 },
        );
        logError("RECEIVE_WATCHDOG_TIMEOUT", req, err, { path, size, declared });
        cleanup(err);
      }
    }, 5000);
    watchdog.unref();

    function cleanup(err) {
      if (finished) return;
      finished = true;
      clearInterval(watchdog);
      try {
        ws.destroy();
      } catch {}
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {}
      }
      reject(err);
    }

    ws.on("error", (err) => {
      logError("WRITE_STREAM_ERROR", req, err, { path, size, declared });
      cleanup(err);
    });

    req.on("error", (err) => {
      logError("REQ_STREAM_ERROR", req, err, { path, size, declared });
      cleanup(err);
    });

    req.on("close", () => {
      if (!finished && !req.complete && declared > 0 && size < declared) {
        const err = Object.assign(
          new Error(
            `การเชื่อมต่อถูกตัดก่อนส่งไฟล์เสร็จ (Client disconnected: ได้รับ ${size}/${declared} bytes)`,
          ),
          { status: 499 },
        );
        logError("REQ_CLOSED_PREMATURELY", req, err, {
          path,
          size,
          declared,
        });
        cleanup(err);
      }
    });

    req.on("data", (chunk) => {
      lastChunkTime = Date.now();
      size += chunk.length;
      if (size > max) {
        return cleanup(
          Object.assign(new Error("ไฟล์ใหญ่เกินขนาดที่อนุญาต"), {
            status: 413,
          }),
        );
      }
      if (head.length < 32) {
        head = Buffer.concat([head, chunk]).subarray(0, 32);
      }
      hash.update(chunk);

      if (!ws.write(chunk)) {
        req.pause();
        ws.once("drain", () => req.resume());
      }
    });

    req.on("end", () => {
      clearInterval(watchdog);
      ws.end((err) => {
        if (err) return cleanup(err);
        if (finished) return;
        finished = true;
        logInfo("RECEIVE_FINISH", req, { path, size, declared });
        resolve({ size, head, checksum: hash.digest("hex") });
      });
    });
  });
}
function signature(h) {
  if (h.length >= 2 && h[0] === 0xff && h[1] === 0xd8)
    return "image/jpeg";
  if (h.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (
    h.toString("ascii", 0, 4) === "RIFF" &&
    h.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (h.includes(Buffer.from("ftyp")) || h.toString("ascii", 4, 8) === "ftyp")
    return "video/mp4";
  const hex = h.subarray(0, 16).toString("hex");
  const ascii = h.subarray(0, 16).toString("ascii").replace(/[^\x20-\x7E]/g, ".");
  fail(400, `รูปแบบไฟล์ไม่ถูกต้อง (Header: hex=[${hex}], ascii=[${ascii}]) — รองรับเฉพาะ JPEG, PNG, WebP และ MP4`);
}
function stream(res, req, path, type) {
  if (!existsSync(path)) fail(404, "ไม่พบไฟล์");
  const size = statSync(path).size;
  const range = req.headers.range;
  res.setHeader("Content-Type", type);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1]
      ? m[2]
        ? Math.min(Number(m[2]), size - 1)
        : size - 1
      : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": end - start + 1,
    });
    createReadStream(path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": size });
    createReadStream(path).pipe(res);
  }
}
function cookie(res, sid, secure) {
  res.setHeader(
    "Set-Cookie",
    `session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? "; Secure" : ""}`,
  );
}

async function handler(req, res) {
  try {
    const secure = !!req.socket.encrypted;
    const url = new URL(req.url, "http://local");
    const path = url.pathname;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin) {
      const origin = new URL(req.headers.origin);
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      if (origin.host !== host && origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1")
        fail(403, "Origin ไม่ถูกต้อง");
    }
    if (path === "/api/health") return send(res, 200, { ok: true });
    if (path === "/api/bootstrap" && req.method === "GET")
      return send(res, 200, {
        needsSetup: !one("SELECT id FROM users LIMIT 1"),
        local:
          process.env.ALLOW_REMOTE_SETUP === "true" ||
          ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress,
          ),
      });
    if (path === "/api/setup" && req.method === "POST") {
      if (
        process.env.ALLOW_REMOTE_SETUP !== "true" &&
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress,
        )
      )
        fail(403, "สร้างผู้ดูแลครั้งแรกจาก localhost เท่านั้น (หรือตั้งค่า ALLOW_REMOTE_SETUP=true)");
      const b = await json(req);
      const hash = password(b.password);
      const email = str(b.email).toLowerCase();
      const u = tx(() => {
        if (one("SELECT id FROM users LIMIT 1")) fail(409, "ตั้งค่าระบบแล้ว");
        const id = randomUUID();
        put(
          "organizations",
          id,
          "",
          { name: str(b.organization), quota: 10 * 1024 ** 3 },
          id,
        );
        const uid = randomUUID();
        run(
          "INSERT INTO users VALUES(?,?,?,?,?,?,?,?)",
          uid,
          email,
          str(b.name),
          "platform",
          id,
          "",
          hash,
          now(),
        );
        return one("SELECT * FROM users WHERE id=?", uid);
      });
      const sid = token();
      run(
        "INSERT INTO sessions VALUES(?,?,?)",
        sha(sid),
        u.id,
        now() + 43200000,
      );
      cookie(res, sid, secure);
      return send(res, 201, cleanUser(u));
    }
    if (path === "/api/login" && req.method === "POST") {
      throttle(req, "login", 10);
      const b = await json(req);
      const u = one(
        "SELECT * FROM users WHERE email=?",
        String(b.email).toLowerCase(),
      );
      if (!u || !match(b.password, u.hash))
        fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      const sid = token();
      run(
        "INSERT INTO sessions VALUES(?,?,?)",
        sha(sid),
        u.id,
        now() + 43200000,
      );
      cookie(res, sid, secure);
      return send(res, 200, cleanUser(u));
    }
    if (path === "/api/logout" && req.method === "POST") {
      const u = user(req);
      const sid = (req.headers.cookie || "").match(/session=([^;]+)/)?.[1];
      run("DELETE FROM sessions WHERE hash=?", sha(sid || ""));
      cookie(res, "", secure);
      return send(res, 200, { ok: true });
    }
    if (path === "/api/pair/start" && req.method === "POST") {
      throttle(req, "pair", 15);
      const secret = token();
      let code;
      do {
        code = String(randomInt(100000, 1000000));
      } while (one("SELECT hash FROM pairs WHERE code=?", code));
      run(
        "INSERT INTO pairs VALUES(?,?,?,NULL)",
        sha(secret),
        code,
        now() + 600000,
      );
      return send(res, 201, { secret, code, expires: now() + 600000 });
    }
    if (path === "/api/pair/status" && req.method === "POST") {
      const b = await json(req);
      const p = one(
        "SELECT * FROM pairs WHERE hash=? AND expires>?",
        sha(String(b.secret)),
        now(),
      );
      if (!p) fail(410, "รหัสหมดอายุ กรุณาสร้างรหัสใหม่");
      if (!p.device) return send(res, 200, { pending: true });
      const key = token();
      tx(() => {
        run("INSERT INTO device_keys VALUES(?,?)", sha(key), p.device);
        run("DELETE FROM pairs WHERE hash=?", p.hash);
      });
      return send(res, 200, { token: key, device: p.device });
    }
    if (path.startsWith("/api/device/")) {
      const d = device(req);
      if (path === "/api/device/manifest" && req.method === "GET")
        return send(res, 200, manifest(d));
      if (path.startsWith("/api/device/media/") && req.method === "GET") {
        const id = path.split("/").pop();
        if (!allowedMedia(d, id)) fail(403, "สื่อไม่ได้อยู่ในตารางของจอ");
        const m = entity(id, "media");
        return stream(res, req, join(home, "media", m.id), m.type);
      }
      if (path === "/api/device/heartbeat" && req.method === "POST") {
        const b = await json(req);
        if (!["HEALTHY", "DEGRADED", "CRITICAL", "UNKNOWN"].includes(b.health))
          fail(400, "สถานะไม่ถูกต้อง");
        const previous = d.health;
        const next = put(
          "displays",
          d.org,
          d.branch,
          {
            ...d,
            lastSeen: now(),
            health: b.health,
            cache: b.cache || {},
            current: b.current || null,
            revision: String(b.revision || ""),
            capabilities: b.capabilities || {},
            error: String(b.error || "").slice(0, 500),
          },
          d.id,
        );
        if (previous !== b.health || b.error)
          run(
            "INSERT INTO events VALUES(?,?,?,?,?,?,?)",
            randomUUID(),
            d.org,
            d.branch,
            d.id,
            b.health,
            String(b.error || "สถานะ Cache เปลี่ยน").slice(0, 500),
            now(),
          );
        return send(res, 200, {
          serverTime: now(),
          screenshotRequested: !!d.screenshotRequested,
          revoked: false,
        });
      }
      if (path === "/api/device/screenshot" && req.method === "POST") {
        const temp = join(home, "screens", d.id + "." + randomUUID() + ".tmp");
        const f = await receiveFile(req, temp, 1024 * 1024);
        try {
          if (signature(f.head) !== "image/jpeg") fail(400, "ต้องเป็น JPEG");
          renameSync(temp, join(home, "screens", d.id));
          put(
            "displays",
            d.org,
            d.branch,
            {
              ...d,
              screenshotAt: now(),
              screenshotRequested: false,
              screenshotMedia: url.searchParams.get("media") || "",
              screenshotVersion: url.searchParams.get("version") || "",
            },
            d.id,
          );
        } catch (e) {
          if (existsSync(temp)) unlinkSync(temp);
          throw e;
        }
        return send(res, 200, { ok: true });
      }
      if (path === "/api/device/plays" && req.method === "POST") {
        const b = await json(req);
        if (!Array.isArray(b.items) || b.items.length > 200)
          fail(400, "จำนวนรายการไม่ถูกต้อง");
        tx(() => {
          for (const p of b.items) {
            str(p.id, 100);
            const m = entity(p.media, "media");
            if (m.org !== d.org) fail(403, "สื่ออยู่คนละองค์กร");
            if (
              !Number.isInteger(p.count) ||
              p.count < 1 ||
              p.count > 10000 ||
              !Number.isFinite(p.seconds) ||
              p.seconds < 0 ||
              p.seconds > 864000 ||
              !Number.isFinite(p.last) ||
              Math.abs(p.last - now()) > 90 * 86400000
            )
              fail(400, "ข้อมูลการเล่นไม่ถูกต้อง");
            const day = new Date(p.last).toISOString().slice(0, 10);
            const inserted = run(
              "INSERT OR IGNORE INTO plays VALUES(?,?,?,?,?,?,?,?,?,?)",
              p.id,
              d.org,
              d.branch,
              d.id,
              p.media,
              day,
              p.count,
              p.seconds,
              p.last,
              now(),
            );
            if (inserted.changes)
              run(
                "INSERT INTO daily VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(device,media,day) DO UPDATE SET count=count+excluded.count,seconds=seconds+excluded.seconds,last=MAX(last,excluded.last)",
                d.org,
                d.branch,
                d.id,
                p.media,
                day,
                p.count,
                p.seconds,
                p.last,
              );
          }
        });
        return send(res, 200, { ok: true });
      }
      fail(404, "ไม่พบ Device API");
    }
    if (path.startsWith("/api/")) {
      const u = user(req);
      const org = url.searchParams.get("org") || u.org;
      scope(u, org);
      if (path === "/api/me") return send(res, 200, cleanUser(u));
      if (path === "/api/state" && req.method === "GET")
        return send(res, 200, {
          user: cleanUser(u),
          organizations:
            u.role === "platform"
              ? all("SELECT id FROM entities WHERE kind='organizations'").map(
                  (r) => entity(r.id),
                )
              : [entity(u.org)],
          branches: rows(u, "branches", org),
          displays: rows(u, "displays", org),
          media: rows(u, "media", org),
          playlists: rows(u, "playlists", org),
          schedules: rows(u, "schedules", org),
          versions: rows(u, "versions", org),
          events: all(
            "SELECT * FROM events WHERE org=? AND (?=0 OR branch=?) ORDER BY at DESC LIMIT 100",
            org,
            u.role === "branch" ? 1 : 0,
            u.branch,
          ),
          users:
            u.role === "branch"
              ? []
              : all(
                  "SELECT id,email,name,role,org,branch FROM users WHERE org=?",
                  org,
                ),
        });
      if (path === "/api/reports" && req.method === "GET")
        return send(res, 200, {
          daily: all(
            "SELECT * FROM daily WHERE org=? AND (?=0 OR branch=?) ORDER BY day DESC LIMIT 10000",
            org,
            u.role === "branch" ? 1 : 0,
            u.branch,
          ),
          audit: all(
            "SELECT * FROM audit WHERE org=? AND (?=0 OR branch=?) ORDER BY at DESC LIMIT 1000",
            org,
            u.role === "branch" ? 1 : 0,
            u.branch,
          ),
        });
      if (path === "/api/logs" && req.method === "GET") {
        admin(u);
        const logPath = join(home, "error.log");
        if (!existsSync(logPath)) {
          return send(res, 200, { lines: [], file: logPath });
        }
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 1000);
        const content = readFileSync(logPath, "utf8");
        const lines = content.trim().split("\n").filter(Boolean).slice(-limit);
        return send(res, 200, { lines, total: lines.length, file: logPath });
      }
      if (path === "/api/users" && req.method === "POST") {
        admin(u);
        const b = await json(req);
        if (!["organization", "branch"].includes(b.role))
          fail(400, "สิทธิ์ไม่ถูกต้อง");
        if (b.role === "branch") branchCheck(u, org, b.branch);
        const id = randomUUID();
        run(
          "INSERT INTO users VALUES(?,?,?,?,?,?,?,?)",
          id,
          str(b.email).toLowerCase(),
          str(b.name),
          b.role,
          org,
          b.role === "branch" ? b.branch : "",
          password(b.password),
          now(),
        );
        audit(u, "create-user", { id, org });
        return send(res, 201, { id });
      }
      if (path === "/api/media" && req.method === "POST") {
        const branch = url.searchParams.get("branch");
        branchCheck(u, org, branch);
        const name = str(url.searchParams.get("name"));
        const declared = Number(req.headers["content-length"]);
        const organization = entity(org);
        const used = rows({ role: "platform" }, "media", org).reduce(
          (s, m) => s + m.size,
          0,
        );
        const max = Math.min(500 * 1024 ** 2, organization.quota - used);

        logInfo("UPLOAD_START", req, {
          user: u.email,
          userId: u.id,
          name,
          branch,
          org,
          declaredSize: declared,
          usedQuota: used,
          totalQuota: organization.quota,
          maxAllowed: max,
        });

        if (max <= 0 || declared > max) {
          const reason = max <= 0
            ? `พื้นที่องค์กรเต็ม (ใช้ไปแล้ว ${used} จาก ${organization.quota} bytes)`
            : `ขนาดไฟล์ (${declared} bytes) เกินพื้นที่คงเหลือ (${max} bytes) หรือเกินขนาดสูงสุด 500 MB`;
          logError("UPLOAD_QUOTA_EXCEEDED", req, new Error(reason), { declared, max, used, quota: organization.quota });
          fail(413, reason);
        }

        const id = randomUUID(),
          temp = join(home, "media", id + ".tmp");

        let f;
        try {
          f = await receiveFile(req, temp, max, declared);
        } catch (streamErr) {
          logError("UPLOAD_STREAM_FAILED", req, streamErr, { temp, declared, name });
          throw streamErr;
        }

        try {
          const type = signature(f.head);
          tx(() => {
            const current = rows({ role: "platform" }, "media", org).reduce(
              (s, m) => s + m.size,
              0,
            );
            if (current + f.size > organization.quota)
              fail(413, `พื้นที่องค์กรเต็ม (โควตา ${organization.quota} bytes, ปัจจุบันใช้ ${current} bytes, ไฟล์ใหม่ ${f.size} bytes)`);
            put(
              "media",
              org,
              branch,
              {
                name,
                type,
                size: f.size,
                checksum: f.checksum,
                trashedAt: null,
              },
              id,
            );
          });
          renameSync(temp, join(home, "media", id));
          audit(u, "upload-media", { id, org, branch });
          logInfo("UPLOAD_SUCCESS", req, { id, name, type, size: f.size, checksum: f.checksum });
          return send(res, 201, entity(id));
        } catch (e) {
          if (existsSync(temp)) {
            try { unlinkSync(temp); } catch {}
          }
          run("DELETE FROM entities WHERE id=?", id);
          logError("UPLOAD_PROCESSING_ERROR", req, e, { id, name, branch, temp, headHex: f?.head?.toString("hex") });
          throw e;
        }
      }
      const file = /^\/api\/media\/([^/]+)\/file$/.exec(path);
      if (file && req.method === "GET") {
        const m = entity(file[1], "media");
        check(u, m);
        return stream(res, req, join(home, "media", m.id), m.type);
      }
      const shot = /^\/api\/displays\/([^/]+)\/screenshot$/.exec(path);
      if (shot) {
        const d = entity(shot[1], "displays");
        check(u, d);
        if (req.method === "POST") {
          put(
            "displays",
            d.org,
            d.branch,
            { ...d, screenshotRequested: true },
            d.id,
          );
          return send(res, 200, { queued: true });
        }
        if (req.method === "GET")
          return stream(res, req, join(home, "screens", d.id), "image/jpeg");
      }
      const action =
        /^\/api\/(media|playlists|displays|schedules|branches)\/([^/]+)\/(publish|archive|restore|trash|revoke|edit|set-default|delete)$/.exec(
          path,
        );
      if (action && req.method === "POST") {
        const [, kind, id, verb] = action,
          e = entity(id, kind);
        check(u, e);
        const b = await json(req);
        if (kind === "media" && ["trash", "restore"].includes(verb)) {
          if (verb === "trash" && mediaRefs(id).length)
            fail(
              409,
              "สื่อยังถูกอ้างอิงโดย Playlist หรือ Published version จึงลบไม่ได้",
            );
          const r = put(
            kind,
            e.org,
            e.branch,
            { ...e, trashedAt: verb === "trash" ? now() : null },
            id,
          );
          audit(u, verb, r);
          return send(res, 200, r);
        }
        if (kind === "playlists" && verb === "publish") {
          if (!e.items.length) fail(400, "Layout/Playlist ว่าง");
          for (const i of e.items) {
            const m = entity(i.media, "media");
            check(u, m);
            if (m.trashedAt || !existsSync(join(home, "media", m.id)))
              fail(400, "มีสื่อในถังขยะหรือไฟล์หาย");
          }
          const v = put("versions", e.org, e.branch, {
            name: e.name,
            playlist: e.id,
            description: e.description || "",
            items: e.items.map((i) => ({
              ...i,
              transition: i.transition || "fade",
              transitionSpeed: Number(i.transitionSpeed) || 0.8,
              ...(() => {
                const m = entity(i.media);
                return {
                  type: m.type,
                  checksum: m.checksum,
                  size: m.size,
                  name: m.name,
                };
              })(),
            })),
            publishedAt: now(),
          });
          put(kind, e.org, e.branch, { ...e, published: v.id }, id);
          if (e.branch) {
            const br = entity(e.branch, "branches");
            let shouldUpdateFallback = !!e.isDefault;
            if (!shouldUpdateFallback && br.fallback) {
              try {
                const fb = entity(br.fallback, "versions");
                if (fb.playlist === id) shouldUpdateFallback = true;
              } catch {}
            }
            if (!br.fallback) shouldUpdateFallback = true;
            if (shouldUpdateFallback) {
              put("branches", br.org, br.id, { ...br, fallback: v.id }, br.id);
            }
          }
          const relatedSchedules = all(
            "SELECT id FROM entities WHERE kind='schedules' AND org=?",
            e.org,
          )
            .map((r) => entity(r.id))
            .filter((s) => s.playlist === id);
          for (const s of relatedSchedules) {
            put("schedules", s.org, s.branch, { ...s, version: v.id }, s.id);
          }
          logInfo("PLAYLIST_PUBLISHED", req, {
            id,
            name: e.name,
            version: v.id,
            updatedSchedules: relatedSchedules.length,
          });
          audit(u, verb, v);
          return send(res, 201, v);
        }
        if (kind === "playlists" && verb === "set-default") {
          let versionId = e.published;
          if (!versionId) {
            if (!e.items.length) fail(400, "Layout ยังไม่มีหน้า");
            for (const i of e.items) {
              const m = entity(i.media, "media");
              check(u, m);
              if (m.trashedAt || !existsSync(join(home, "media", m.id)))
                fail(400, "มีสื่อในถังขยะหรือไฟล์หาย");
            }
            const v = put("versions", e.org, e.branch, {
              name: e.name,
              playlist: e.id,
              description: e.description || "",
              items: e.items.map((i) => ({
                ...i,
                transition: i.transition || "fade",
                transitionSpeed: Number(i.transitionSpeed) || 0.8,
                ...(() => {
                  const m = entity(i.media);
                  return {
                    type: m.type,
                    checksum: m.checksum,
                    size: m.size,
                    name: m.name,
                  };
                })(),
              })),
              publishedAt: now(),
            });
            versionId = v.id;
            put(kind, e.org, e.branch, { ...e, published: v.id }, id);
          }
          if (e.branch) {
            const br = entity(e.branch, "branches");
            put("branches", br.org, br.id, { ...br, fallback: versionId }, br.id);
          }
          for (const pl of rows(u, "playlists", e.org).filter((p) => p.branch === e.branch)) {
            if (pl.id === id) {
              put("playlists", pl.org, pl.branch, { ...pl, isDefault: true }, pl.id);
            } else if (pl.isDefault) {
              put("playlists", pl.org, pl.branch, { ...pl, isDefault: false }, pl.id);
            }
          }
          audit(u, "set-default-layout", e);
          return send(res, 200, { ok: true, version: versionId });
        }
        if (kind === "playlists" && verb === "delete") {
          const inUse = all("SELECT id FROM entities WHERE kind='schedules' AND org=?", e.org)
            .map(r => entity(r.id))
            .filter(s => s.playlist === id || s.version === e.published);
          if (inUse.length) fail(409, "ไม่สามารถลบได้เนื่องจากมี Schedule กำลังใช้งานอยู่");
          run("DELETE FROM entities WHERE id=?", id);
          if (e.branch) {
            const br = entity(e.branch, "branches");
            if (br.fallback === e.published) {
              put("branches", br.org, br.id, { ...br, fallback: null }, br.id);
            }
          }
          audit(u, "delete-playlist", e);
          return send(res, 200, { ok: true });
        }
        if (kind === "displays" && verb === "revoke") {
          run("DELETE FROM device_keys WHERE device=?", id);
          const r = put(kind, e.org, e.branch, { ...e, revoked: true }, id);
          audit(u, verb, r);
          return send(res, 200, r);
        }
        if (kind === "displays" && verb === "edit") {
          let fallback = e.fallback;
          if (b.fallback !== undefined) {
            fallback = b.fallback ? snapshot(u, b.fallback).id : null;
            if (fallback && entity(fallback).org !== e.org)
              fail(403, "Playlist อยู่คนละองค์กร");
          }
          const r = put(
            kind,
            e.org,
            e.branch,
            {
              ...e,
              name: str(b.name || e.name),
              group:
                typeof b.group === "string" ? b.group.slice(0, 100) : e.group,
              fallback,
            },
            id,
          );
          audit(u, verb, r);
          return send(res, 200, r);
        }
        if (kind === "schedules" && ["publish", "archive"].includes(verb)) {
          const r = put(
            kind,
            e.org,
            e.branch,
            {
              ...e,
              state: verb === "publish" ? "published" : "archived",
              publishedAt: now(),
            },
            id,
          );
          audit(u, verb, r);
          return send(res, 200, r);
        }
        if (kind === "schedules" && verb === "delete") {
          run("DELETE FROM entities WHERE id=?", id);
          audit(u, "delete-schedule", e);
          return send(res, 200, { ok: true });
        }
        if (kind === "branches" && verb === "delete") {
          admin(u);
          const allBranches = rows(u, "branches", e.org);
          if (allBranches.length <= 1) {
            fail(400, "ไม่สามารถลบได้ เนื่องจากองค์กรต้องมีสาขาอย่างน้อย 1 สาขา");
          }
          const displays = rows(u, "displays", e.org).filter(
            (d) => d.branch === id,
          );
          if (displays.length > 0) {
            fail(
              409,
              `ไม่สามารถลบสาขาได้เนื่องจากยังมีจอแสดงผล ${displays.length} จอที่ผูกอยู่กับสาขานี้ (กรุณาลบหรือย้ายจอก่อน)`,
            );
          }
          const schedules = rows(u, "schedules", e.org).filter(
            (s) => s.branch === id,
          );
          if (schedules.length > 0) {
            fail(
              409,
              `ไม่สามารถลบสาขาได้เนื่องจากยังมี Schedule ${schedules.length} รายการในสาขานี้`,
            );
          }
          const playlists = rows(u, "playlists", e.org).filter(
            (p) => p.branch === id,
          );
          if (playlists.length > 0) {
            fail(
              409,
              `ไม่สามารถลบสาขาได้เนื่องจากยังมี Layout/Playlist ${playlists.length} รายการในสาขานี้`,
            );
          }
          const branchMedia = rows(u, "media", e.org).filter(
            (m) => m.branch === id,
          );
          if (branchMedia.length > 0) {
            fail(
              409,
              `ไม่สามารถลบสาขาได้เนื่องจากยังมีไฟล์สื่อ ${branchMedia.length} ไฟล์ในสาขานี้`,
            );
          }
          const branchUsers = all(
            "SELECT id, name FROM users WHERE branch=? AND org=?",
            id,
            e.org,
          );
          if (branchUsers.length > 0) {
            fail(
              409,
              `ไม่สามารถลบสาขาได้เนื่องจากมีผู้ใช้งาน ${branchUsers.length} คนผูกอยู่กับสาขานี้`,
            );
          }
          run("DELETE FROM entities WHERE id=?", id);
          audit(u, "delete-branch", e);
          logInfo("DELETE_BRANCH", req, { id, name: e.name, org: e.org });
          return send(res, 200, { ok: true });
        }
        fail(400, "ไม่รองรับคำสั่งนี้");
      }
      if (req.method === "POST") {
        const b = await json(req);
        if (path === "/api/organizations") {
          if (u.role !== "platform") fail(403, "ต้องใช้ Platform Admin");
          const id = randomUUID();
          const r = put(
            "organizations",
            id,
            "",
            { name: str(b.name), quota: 10 * 1024 ** 3 },
            id,
          );
          audit(u, "create-organization", r);
          return send(res, 201, r);
        }
        if (path === "/api/branches") {
          admin(u);
          try {
            new Intl.DateTimeFormat("en", { timeZone: b.timezone }).format();
          } catch {
            fail(400, "Timezone ไม่ถูกต้อง");
          }
          const id = randomUUID();
          const r = put(
            "branches",
            org,
            id,
            { name: str(b.name), timezone: str(b.timezone) },
            id,
          );
          audit(u, "create-branch", r);
          return send(res, 201, r);
        }
        if (path === "/api/displays") {
          branchCheck(u, org, b.branch);
          str(b.name);
          if (!/^\d{6}$/.test(b.code)) fail(400, "ต้องเป็นรหัสตัวเลข 6 หลัก");
          throttle(req, "claim", 15);
          const r = tx(() => {
            const p = one(
              "SELECT * FROM pairs WHERE code=? AND expires>? AND device IS NULL",
              b.code,
              now(),
            );
            if (!p) fail(400, "รหัสไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว");
            const d = put("displays", org, b.branch, {
              name: str(b.name),
              group: String(b.group || "").slice(0, 100),
              lastSeen: 0,
              health: "UNKNOWN",
              revoked: false,
            });
            run("UPDATE pairs SET device=? WHERE hash=?", d.id, p.hash);
            return d;
          });
          audit(u, "register-display", r);
          return send(res, 201, r);
        }
        if (path === "/api/playlists") {
          branchCheck(u, org, b.branch);
          if (
            !Array.isArray(b.items) ||
            !b.items.length ||
            b.items.length > 100
          )
            fail(400, "เลือกสื่อ 1–100 รายการ");
          const defaultDuration = Number(b.defaultDuration) || 10;
          const defaultTransition = ["fade", "slide", "zoom", "none"].includes(b.defaultTransition) ? b.defaultTransition : "fade";
          const defaultSpeed = Number(b.defaultTransitionSpeed) || 0.8;
          const items = b.items.map((i) => {
            const m = entity(i.media, "media");
            check(u, m);
            if (m.org !== org || m.trashedAt) fail(400, "สื่อไม่พร้อมใช้");
            if (u.role === "branch" && m.branch !== b.branch)
              fail(403, "สื่ออยู่คนละสาขา");
            const duration = Number(i.duration);
            if (!Number.isFinite(duration) || duration < 1 || duration > 3600)
              fail(400, "ระยะเวลาต้องอยู่ระหว่าง 1–3600 วินาที");
            const transition = ["fade", "slide", "zoom", "none"].includes(i.transition) ? i.transition : defaultTransition;
            const sp = Number(i.transitionSpeed);
            const transitionSpeed = Number.isFinite(sp) && sp >= 0.1 && sp <= 10 ? sp : defaultSpeed;
            return { media: m.id, duration, transition, transitionSpeed };
          });
          const id = (typeof b.id === "string" && b.id) ? b.id : randomUUID();
          const existing = one("SELECT data FROM entities WHERE id=?", id);
          const oldData = existing ? JSON.parse(existing.data) : {};
          const r = put("playlists", org, b.branch, {
            ...oldData,
            name: str(b.name),
            description: String(b.description || "").slice(0, 500),
            defaultDuration,
            defaultTransition,
            defaultTransitionSpeed: defaultSpeed,
            items,
            published: oldData.published || null,
            isDefault: oldData.isDefault || false,
          }, id);
          audit(u, existing ? "update-playlist" : "create-playlist", r);
          return send(res, 201, r);
        }
        if (path === "/api/schedules") {
          const version = snapshot(u, b.playlist);
          if (version.org !== org) fail(403, "Playlist อยู่คนละองค์กร");
          const type = b.targetType;
          if (!["display", "group", "branch", "organization"].includes(type))
            fail(400, "เป้าหมายไม่ถูกต้อง");
          if (type === "organization") admin(u);
          const branch = type === "organization" ? "" : str(b.branch);
          if (branch) branchCheck(u, org, branch);
          const targets = Array.isArray(b.targets)
            ? [...new Set(b.targets)]
            : [];
          if (type === "display" && !targets.length)
            fail(400, "เลือกอย่างน้อย 1 จอ");
          for (const id of targets) {
            const d = entity(id, "displays");
            check(u, d);
            if (d.org !== org || d.branch !== branch || d.revoked)
              fail(400, "จอไม่พร้อมหรืออยู่คนละสาขา");
          }
          if (type === "group" && !str(b.group)) fail(400, "เลือกกลุ่มจอ");
          const validDate = (s) =>
            typeof s === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(s) &&
            !isNaN(Date.parse(s)) &&
            new Date(s).toISOString().slice(0, 10) === s;
          if (
            !validDate(b.startDate) ||
            !validDate(b.endDate) ||
            b.startDate > b.endDate
          )
            fail(400, "ช่วงวันที่ไม่ถูกต้อง");
          if (
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime) ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.endTime)
          )
            fail(400, "ช่วงเวลาไม่ถูกต้อง");
          if (
            !Array.isArray(b.days) ||
            !b.days.length ||
            b.days.some((x) => !Number.isInteger(x) || x < 0 || x > 6)
          )
            fail(400, "เลือกวันในสัปดาห์");
          const timezone =
            type === "organization" ? str(b.timezone) : entity(branch).timezone;
          try {
            new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
          } catch {
            fail(400, "Timezone ไม่ถูกต้อง");
          }
          const id = (typeof b.id === "string" && b.id) ? b.id : randomUUID();
          const existing = one("SELECT data FROM entities WHERE id=?", id);
          const oldData = existing ? JSON.parse(existing.data) : {};
          const r = put("schedules", org, branch, {
            ...oldData,
            name: str(b.name),
            version: version.id,
            targetType: type,
            targets,
            group: String(b.group || ""),
            startDate: b.startDate,
            endDate: b.endDate,
            startTime: b.startTime,
            endTime: b.endTime,
            days: b.days,
            timezone,
            state: b.state ? (b.state === "published" ? "published" : "draft") : (oldData.state || "published"),
            publishedAt: (b.state === "published" || !oldData.publishedAt) ? now() : oldData.publishedAt,
          }, id);
          audit(u, existing ? "update-schedule" : "create-schedule", r);
          return send(res, 201, r);
        }
      }
      fail(404, "ไม่พบ API");
    }
    const web = join(root, "release/web");
    let file =
      path === "/"
        ? join(web, "index.html")
        : resolve(web, "." + decodeURIComponent(path));
    if (
      !file.startsWith(web + "/") &&
      !file.startsWith(web + "\\") &&
      file !== web
    )
      fail(403, "Path ไม่ถูกต้อง");
    if (path === "/Shotel-Player.apk" || path === "/StayScreen-Player.apk" || path.endsWith(".apk")) {
      const candidates = [
        file,
        join(web, "Shotel-Player.apk"),
        join(web, "StayScreen-Player.apk"),
        join(root, "Shotel-Player.apk"),
        join(root, "StayScreen-Player.apk"),
        join(root, "android/app/build/outputs/apk/debug/app-debug.apk"),
      ];
      for (const cand of candidates) {
        if (existsSync(cand) && statSync(cand).isFile()) {
          file = cand;
          break;
        }
      }
    }
    if (!existsSync(file) || !statSync(file).isFile())
      file = join(web, "index.html");
    if (!existsSync(file)) fail(503, "กรุณา build เว็บก่อน");
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".webmanifest": "application/manifest+json",
      ".apk": "application/vnd.android.package-archive",
    };
    if (file.endsWith(".apk")) {
      const downloadName = path.toLowerCase().includes("stayscreen")
        ? "StayScreen-Player.apk"
        : "Shotel-Player.apk";
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${downloadName}"`,
      );
    }
    return stream(
      res,
      req,
      file,
      types[extname(file)] || "application/octet-stream",
    );
  } catch (e) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    logError("HTTP_REQUEST_ERROR", req, e);
    const status = e.status || 500;
    send(res, status, {
      error: e.message || "เซิร์ฟเวอร์ไม่สามารถทำรายการได้",
      code: e.code,
      status,
    });
  }
}

export function cleanup() {
  const t = now();
  tx(() => {
    run("DELETE FROM sessions WHERE expires<?", t);
    run("DELETE FROM pairs WHERE expires<?", t);
    run("DELETE FROM plays WHERE received<?", t - 90 * 86400000);
    run("DELETE FROM events WHERE at<?", t - 180 * 86400000);
    run("DELETE FROM audit WHERE at<?", t - 365 * 86400000);
    const limit = new Date(t);
    limit.setUTCMonth(limit.getUTCMonth() - 24);
    run("DELETE FROM daily WHERE day<?", limit.toISOString().slice(0, 10));
  });
  for (const m of all("SELECT id FROM entities WHERE kind='media'").map((r) =>
    entity(r.id),
  )) {
    if (
      m.trashedAt &&
      m.trashedAt < t - 30 * 86400000 &&
      !mediaRefs(m.id).length
    ) {
      const file = join(home, "media", m.id);
      if (existsSync(file)) unlinkSync(file);
      run("DELETE FROM entities WHERE id=?", m.id);
    }
  }
  for (const [k, v] of rate) if (v.until < t) rate.delete(k);
}
cleanup();
const interval = setInterval(cleanup, 86400000);
interval.unref();
const tls = process.env.TLS_PFX
  ? {
      pfx: readFileSync(process.env.TLS_PFX),
      passphrase: process.env.TLS_PASSWORD || "",
    }
  : null;
const server = tls
  ? https.createServer(tls, handler)
  : http.createServer(handler);
server.requestTimeout = 600000;
const bindHost = process.env.HOST || "0.0.0.0";
server.listen(
  Number(process.env.PORT || 8787),
  bindHost,
  () => {
    const admin = one("SELECT email FROM users LIMIT 1");
    console.log(
      `Shotel ${tls ? "https" : "http"}://${bindHost}:${server.address().port} | Data: ${home}`,
    );
    if (admin) {
      console.log(`Shotel Admin ready: ${admin.email}`);
    }
  },
);
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit();
  }),
);
