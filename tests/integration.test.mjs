import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
const data = mkdtempSync(join(tmpdir(), "stayscreen-test-"));
let base,
  child,
  cookie = "";
async function start() {
  child = spawn(process.execPath, ["server/index.mjs"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: data, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  base = await new Promise((ok, no) => {
    let stderr = "";
    child.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    child.stdout.on("data", (b) => {
      const m = b.toString().match(/http:\/\/127.0.0.1:\d+/);
      if (m) ok(m[0]);
    });
    child.on("error", no);
    child.on("exit", (c) => no(new Error("server exit " + c + "\nStderr: " + stderr)));
  });
}
async function call(path, body, options = {}) {
  const r = await fetch(base + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    b = text;
  }
  return {
    status: r.status,
    body: b,
    cookie: r.headers.get("set-cookie"),
    headers: r.headers,
  };
}
async function ok(path, body, options) {
  const r = await call(path, body, options);
  assert.ok(r.status < 300, JSON.stringify(r));
  return r.body;
}
test("real registration, durable media, published schedules, isolation, reports, revocation", async (t) => {
  await start();
  t.after(() => {
    child.kill();
  });
  const setup = await call("/setup", {
    email: "owner@test.local",
    password: "a-long-test-password",
    name: "Owner",
    organization: "Hotel A",
  });
  assert.equal(setup.status, 201);
  cookie = setup.cookie.split(";")[0];
  const ownerCookie = cookie,
    org = setup.body.org;
  assert.equal(
    (
      await call("/setup", {
        email: "repeat@test.local",
        password: "a-long-test-password",
        name: "x",
        organization: "x",
      })
    ).status,
    409,
  );
  const branch = await ok("/branches", {
    name: "Bangkok",
    timezone: "Asia/Bangkok",
  });
  const otherBranch = await ok("/branches", {
    name: "Phuket",
    timezone: "Asia/Bangkok",
  });
  const pair = await ok("/pair/start", {});
  assert.match(pair.code, /^\d{6}$/);
  assert.equal(
    (await ok("/pair/status", { secret: pair.secret })).pending,
    true,
  );
  const d = await ok("/displays", {
    name: "Lobby",
    branch: branch.id,
    code: pair.code,
    group: "Lobby",
  });
  assert.equal(d.lastSeen, 0);
  assert.equal(
    (
      await call("/displays", {
        name: "Duplicate",
        branch: branch.id,
        code: pair.code,
      })
    ).status,
    400,
  );
  const credential = await ok("/pair/status", { secret: pair.secret });
  const auth = { headers: { Authorization: "Bearer " + credential.token } };
  assert.equal(
    (await call("/pair/status", { secret: pair.secret })).status,
    410,
  );
  // A real PNG fixture, stored in the temporary server's media directory.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=",
    "base64",
  );
  const up = await fetch(
    base + `/api/media?branch=${branch.id}&name=screen.png`,
    { method: "POST", headers: { Cookie: cookie }, body: png },
  );
  assert.equal(up.status, 201);
  const m = await up.json();
  const p = await ok("/playlists", {
    name: "Welcome",
    branch: branch.id,
    items: [{ media: m.id, duration: 5 }],
  });
  const version = await ok(`/playlists/${p.id}/publish`, {});
  const schedule = {
    name: "Lobby morning",
    playlist: p.id,
    branch: branch.id,
    targetType: "display",
    targets: [d.id],
    startDate: "2026-01-01",
    endDate: "2027-01-01",
    startTime: "00:00",
    endTime: "00:00",
    days: [0, 1, 2, 3, 4, 5, 6],
    state: "draft",
  };
  const draft = await ok("/schedules", schedule);
  assert.equal(
    (await ok("/device/manifest", undefined, auth)).schedules.length,
    0,
  );
  await ok(`/schedules/${draft.id}/publish`, {});
  const manifest = await ok("/device/manifest", undefined, auth);
  assert.equal(manifest.schedules[0].snapshot.id, version.id);
  const ranged = await fetch(base + `/api/device/media/${m.id}`, {
    headers: { ...auth.headers, Range: "bytes=0-7" },
  });
  assert.equal(ranged.status, 206);
  assert.equal((await ranged.arrayBuffer()).byteLength, 8);
  assert.equal((await call(`/media/${m.id}/trash`, {})).status, 409);
  assert.equal(
    (
      await call("/schedules", {
        ...schedule,
        startDate: "2027-01-01",
        endDate: "2026-01-01",
      })
    ).status,
    400,
  );
  await ok(
    "/device/heartbeat",
    {
      health: "DEGRADED",
      cache: { ready: 0, total: 1 },
      error: "Cache missing",
      capabilities: { screenshot: true },
    },
    auth,
  );
  const batch = {
    items: [
      { id: "batch-1", media: m.id, count: 2, seconds: 10, last: Date.now() },
    ],
  };
  await ok("/device/plays", batch, auth);
  await ok("/device/plays", batch, auth);
  assert.equal((await ok("/reports")).daily[0].count, 2);
  await ok("/users", {
    email: "branch@test.local",
    name: "Branch",
    password: "another-test-password",
    role: "branch",
    branch: otherBranch.id,
  });
  const login = await call("/login", {
    email: "branch@test.local",
    password: "another-test-password",
  });
  cookie = login.cookie.split(";")[0];
  assert.equal((await ok("/state")).displays.length, 0);
  assert.equal((await call(`/media/${m.id}/file`)).status, 403);
  assert.equal(
    (
      await call("/displays", {
        name: "Intruder",
        code: "123456",
        branch: branch.id,
      })
    ).status,
    403,
  );
  cookie = ownerCookie;
  const orgB = await ok("/organizations", { name: "Other tenant" });
  assert.equal((await ok("/state?org=" + orgB.id)).displays.length, 0);
  await ok("/users", {
    email: "org@test.local",
    name: "Org",
    password: "organization-password",
    role: "organization",
  });
  const l = await call("/login", {
    email: "org@test.local",
    password: "organization-password",
  });
  cookie = l.cookie.split(";")[0];
  assert.equal((await call("/state?org=" + orgB.id)).status, 403);
  cookie = ownerCookie;
  assert.equal(
    (
      await call(
        "/branches",
        { name: "CSRF", timezone: "Asia/Bangkok" },
        { headers: { Origin: "https://attacker.example" } },
      )
    ).status,
    403,
  );
  await ok(`/schedules/${draft.id}/archive`, {});
  assert.equal(
    (await ok("/device/manifest", undefined, auth)).schedules.length,
    0,
  );
  assert.equal((await ok("/state")).versions.length, 1);
  await ok(`/displays/${d.id}/revoke`, {});
  assert.equal((await call("/device/manifest", undefined, auth)).status, 401);
  child.kill();
  await once(child, "exit");
  await start();
  assert.equal((await ok("/state")).media.length, 1);
  assert.equal((await ok("/reports")).daily[0].count, 2);
  assert.equal((await ok("/state")).versions[0].id, version.id);
});
