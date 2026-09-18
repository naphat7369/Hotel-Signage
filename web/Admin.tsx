import { FormEvent, useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import {
  Monitor,
  CalendarDays,
  Images,
  ListVideo,
  Building2,
  Users,
  BarChart3,
  LogOut,
  Plus,
  Play,
  Upload,
  Settings,
  RefreshCw,
  X,
  HardDrive,
  ShieldCheck,
  LayoutDashboard,
  Trash2,
  Star,
  Clock,
  Search,
  Check,
  Edit3,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { api, size, when } from "./api";
import { selectProgram } from "../shared/schedule.mjs";

type Row = Record<string, any>;
const days = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const field = (form: HTMLFormElement) => Object.fromEntries(new FormData(form));
const initial = {
  organizations: [],
  branches: [],
  displays: [],
  media: [],
  playlists: [],
  schedules: [],
  versions: [],
  events: [],
  users: [],
} as Record<string, any>;
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="veil" />
        <Dialog.Content className="modal">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="muted">
            ข้อมูลจะบันทึกในเซิร์ฟเวอร์ขององค์กร
          </Dialog.Description>
          <Dialog.Close className="close" aria-label="ปิด">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Badge({ d }: { d: Row }) {
  const online = !d.revoked && Date.now() - d.lastSeen < 90000;
  const statusClass = !online ? "gray" : d.health === "HEALTHY" ? "green" : "amber";
  const label = d.revoked
    ? "ยกเลิกแล้ว"
    : !online
      ? "ออฟไลน์"
      : d.health === "HEALTHY"
        ? "ออนไลน์ · พร้อมเล่น"
        : d.health === "UNKNOWN"
          ? "กำลังตรวจสอบ"
          : d.health;
  return (
    <span className={`badge status-pill ${statusClass}`}>
      <span className="status-dot" />
      <span>{label}</span>
    </span>
  );
}
function ToastNotification({
  message,
  type = "notice",
  onClose,
  duration = 3500,
}: {
  message: string;
  type?: "notice" | "error";
  onClose: () => void;
  duration?: number;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef(Date.now());
  const remainingRef = useRef(duration);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      triggerDismiss();
    }, remainingRef.current);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const triggerDismiss = () => {
    clearTimer();
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  useEffect(() => {
    setIsExiting(false);
    remainingRef.current = duration;
    startTimer();
    return () => clearTimer();
  }, [message]);

  const handleMouseEnter = () => {
    clearTimer();
    const elapsed = Date.now() - startTimeRef.current;
    remainingRef.current = Math.max(500, remainingRef.current - elapsed);
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    startTimer();
  };

  if (!message) return null;
  const isNotice = type === "notice";

  return (
    <div
      className={`toast-banner ${isNotice ? "toast-notice" : "toast-error"} ${isExiting ? "toast-exit" : "toast-enter"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role={isNotice ? "status" : "alert"}
    >
      <div className="toast-icon">
        {isNotice ? (
          <CheckCircle2 size={19} className="toast-icon-svg" />
        ) : (
          <AlertCircle size={19} className="toast-icon-svg" />
        )}
      </div>
      <div className="toast-body">
        <span className="toast-message">{message}</span>
      </div>
      <button
        type="button"
        className="toast-close-btn"
        aria-label="ปิดข้อความ"
        onClick={triggerDismiss}
      >
        <X size={15} />
      </button>
      <div
        className={`toast-progress-bar ${isPaused ? "paused" : ""}`}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}
function getScheduleInfo(s: Row) {
  const isAllDay = s.startTime === s.endTime;
  const now = new Date();
  
  const [endHour, endMin] = (s.endTime || "00:00").split(":").map(Number);
  const endDateTime = new Date(`${s.endDate}T${isAllDay ? "23:59:59" : `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`}`);
  
  const [startHour, startMin] = (s.startTime || "00:00").split(":").map(Number);
  const startDateTime = new Date(`${s.startDate}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00`);
  
  const diffMs = endDateTime.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  
  const isExpired = diffMs < 0;
  const isUpcoming = now < startDateTime;
  
  let badgeClass = "badge gray";
  let badgeLabel = s.state;
  let expireText = "";
  let expireClass = "";

  if (s.state === "draft") {
    badgeClass = "badge gray";
    badgeLabel = "⚪ ร่าง (Draft)";
    expireText = `หมดอายุ: ${s.endDate} ${isAllDay ? "23:59" : s.endTime}`;
  } else if (s.state === "archived") {
    badgeClass = "badge gray";
    badgeLabel = "📦 จัดเก็บ (Archived)";
    expireText = `สิ้นสุดเมื่อ: ${s.endDate}`;
  } else if (isExpired) {
    badgeClass = "badge red";
    badgeLabel = "⛔ หมดอายุแล้ว";
    expireClass = "schedule-expired";
    const passedDays = Math.abs(diffDays);
    expireText = `หมดอายุเมื่อ ${s.endDate} (${passedDays === 0 ? "วันนี้" : `${passedDays} วันที่แล้ว`})`;
  } else if (isUpcoming) {
    badgeClass = "badge yellow";
    badgeLabel = "🕒 รอเริ่มตามเวลา";
    expireClass = "schedule-upcoming";
    const startInDays = Math.ceil((startDateTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expireText = `เริ่ม ${s.startDate} (อีก ${startInDays} วัน)`;
  } else {
    badgeClass = "badge green";
    badgeLabel = "🟢 กำลังเผยแพร่";
    expireClass = "schedule-active";
    if (diffDays <= 0 || diffHours <= 24) {
      expireText = `⚠️ หมดอายุวันนี้ ${isAllDay ? "23:59" : s.endTime} (เหลือ ${Math.max(1, diffHours)} ชม.)`;
    } else if (diffDays === 1) {
      expireText = `⏳ เหลืออีก 1 วัน (หมดอายุพรุ่งนี้)`;
    } else {
      expireText = `⏳ เหลืออีก ${diffDays} วัน (หมดอายุ ${s.endDate})`;
    }
  }

  return {
    isExpired,
    isUpcoming,
    badgeClass,
    badgeLabel,
    expireText,
    expireClass,
    endDateTimeStr: `${s.endDate} ${isAllDay ? "(สิ้นวัน 23:59)" : `${s.endTime} น.`}`,
  };
}

function PreviewModal({
  items,
  media = [],
  onClose,
}: {
  items: Row[];
  media?: Row[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [outgoing, setOutgoing] = useState<{ item: Row; key: string } | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const isVideoItem = (it?: Row | null) => {
    if (!it) return false;
    if (it.type?.startsWith("video")) return true;
    if (it.name?.toLowerCase().endsWith(".mp4")) return true;
    const found = media.find((x) => x.id === it.media);
    return !!(found?.type?.startsWith("video") || found?.name?.toLowerCase().endsWith(".mp4"));
  };

  // Preload all preview images so transitions are instant
  useEffect(() => {
    items.forEach((it) => {
      if (!isVideoItem(it) && it.media) {
        const img = new Image();
        img.src = "/api/media/" + it.media + "/file";
      }
    });
  }, [items, media]);

  const goTo = (nextIdx: number) => {
    if (!items.length) return;
    const nextNormalized = (nextIdx + items.length) % items.length;
    if (nextNormalized === index && items.length > 1) return;
    const current = items[index];
    if (current) {
      setOutgoing({ item: current, key: `out-${index}-${animKey}` });
    }
    setAnimKey((k) => k + 1);
    setIndex(nextNormalized);
  };

  // Clear outgoing after transition duration
  useEffect(() => {
    if (!outgoing) return;
    const cur = items[index];
    const duration = ((Number(cur?.transitionSpeed) || 0.8) * 1000) + 50;
    const t = setTimeout(() => {
      setOutgoing(null);
    }, duration);
    return () => clearTimeout(t);
  }, [outgoing, index, items]);

  useEffect(() => {
    const cur = items[index];
    if (!items.length || isVideoItem(cur)) return;
    const t = setTimeout(
      () => goTo(index + 1),
      (Number(cur?.duration) || 10) * 1000,
    );
    return () => clearTimeout(t);
  }, [index, items, media]);

  const m = items[index];
  const transitionEffect = m?.transition || "fade";
  const transitionSpeed = Number(m?.transitionSpeed) || 0.8;
  const isCurVideo = isVideoItem(m);

  return (
    <Modal title="Preview Layout (ตัวอย่างการแสดงผล)" onClose={onClose}>
      {m ? (
        <>
          <div className="preview preview-stage" style={{ marginBottom: 16, border: "1px solid #1e293b" }}>
            {outgoing && (
              <div
                key={outgoing.key}
                className={`slide-layer anim-outgoing transition-${outgoing.item.transition || transitionEffect}`}
                style={
                  {
                    "--transition-speed": `${transitionSpeed}s`,
                  } as React.CSSProperties
                }
              >
                {isVideoItem(outgoing.item) ? (
                  <video
                    src={"/api/media/" + outgoing.item.media + "/file"}
                    muted
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img
                    src={"/api/media/" + outgoing.item.media + "/file"}
                    alt=""
                  />
                )}
              </div>
            )}
            <div
              key={`in-${index}-${animKey}`}
              className={`slide-layer ${outgoing ? `anim-incoming transition-${transitionEffect}` : ""}`}
              style={
                {
                  "--transition-speed": `${transitionSpeed}s`,
                } as React.CSSProperties
              }
            >
              {isCurVideo ? (
                <video
                  src={"/api/media/" + m.media + "/file"}
                  autoPlay
                  muted
                  playsInline
                  controls
                  onEnded={() => goTo(index + 1)}
                />
              ) : (
                <img
                  src={"/api/media/" + m.media + "/file"}
                  alt={m.name}
                />
              )}
            </div>
          </div>
          <p style={{ marginTop: 10 }}>
            <strong>หน้า {index + 1}/{items.length}</strong> · {m.name} ·{" "}
            {isCurVideo ? (
              <span style={{ color: "#166534", fontWeight: 600 }}>🎬 วิดีโอ (เล่นตามความยาวไฟล์จนจบ)</span>
            ) : (
              <span>{m.duration || 10} วินาที</span>
            )}{" "}
            · เอฟเฟค: <strong>{transitionEffect}</strong> ({transitionSpeed}s)
          </p>
          <div
            className="actions row"
            style={{ justifyContent: "space-between", marginTop: 12 }}
          >
            <button onClick={() => goTo(index - 1)}>
              ← หน้าก่อนหน้า
            </button>
            <button className="primary" onClick={() => goTo(index + 1)}>
              หน้าถัดไป →
            </button>
          </div>
        </>
      ) : (
        <p>ไม่มีสื่อที่แสดงใน Layout นี้</p>
      )}
    </Modal>
  );
}

export default function Admin() {
  const [data, setData] = useState(initial),
    [boot, setBoot] = useState<Row | null>(null),
    [user, setUser] = useState<Row | null>(null),
    [org, setOrg] = useState(""),
    [tab, setTab] = useState("overview"),
    [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [branch, setBranch] = useState(""),
    [detail, setDetail] = useState<Row | null>(null),
    [preview, setPreview] = useState<Row[] | null>(null),
    [report, setReport] = useState<Row>({ daily: [], audit: [] }),
    [items, setItems] = useState<Row[]>([]),
    [targets, setTargets] = useState<string[]>([]),
    [targetType, setTargetType] = useState("display"),
    [formBranch, setFormBranch] = useState(""),
    [progress, setProgress] = useState(0),
    [defaultDuration, setDefaultDuration] = useState(10),
    [defaultTransition, setDefaultTransition] = useState("fade"),
    [defaultSpeed, setDefaultSpeed] = useState(0.8),
    [statusFilter, setStatusFilter] = useState("all"),
    [mediaPickerMode, setMediaPickerMode] = useState<"add" | number | null>(null),
    [pickerSearch, setPickerSearch] = useState(""),
    [pickerType, setPickerType] = useState<"all" | "image" | "video">("all"),
    [scheduleFilter, setScheduleFilter] = useState<"all" | "active" | "upcoming" | "expired" | "default" | "archived">("all"),
    [scheduleSearch, setScheduleSearch] = useState(""),
    [scheduleBranch, setScheduleBranch] = useState(""),
    [playlistFilter, setPlaylistFilter] = useState<"all" | "active" | "expired" | "default" | "unscheduled">("all"),
    [playlistSearch, setPlaylistSearch] = useState(""),
    [playlistBranch, setPlaylistBranch] = useState(""),
    [systemLogs, setSystemLogs] = useState<string[]>([]);
  const lastOrg = useRef("");
  const playlistFileRef = useRef<HTMLInputElement>(null);
  const pickerFileRef = useRef<HTMLInputElement>(null);
  async function loadLogs() {
    try {
      setBusy(true);
      const res = await api("/logs", undefined, org);
      setSystemLogs(res.lines || []);
      setModal("systemLogs");
    } catch (e: any) {
      console.error("[Logs Error]", e);
      setError("ไม่สามารถดึงบันทึก Log ได้: " + e.message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh(selected = org) {
    const d = await api("/state", undefined, selected);
    if (lastOrg.current !== selected) return;
    setData(d);
    setUser(d.user);
  }
  useEffect(() => {
    api("/bootstrap").then(setBoot);
    api("/me")
      .then((u) => {
        setUser(u);
        setOrg(u.org);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!org || !user) return;
    lastOrg.current = org;
    setBranch("");
    refresh(org).catch((e) => setError(e.message));
    const id = setInterval(() => refresh(org).catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [org, !!user]);
  useEffect(() => {
    if (!formBranch && (data.branches as Row[])?.length > 0) {
      setFormBranch((data.branches as Row[])[0].id);
    }
  }, [formBranch, data.branches]);
  useEffect(() => {
    if (tab === "reports" && user)
      api("/reports", undefined, org)
        .then(setReport)
        .catch((e) => setError(e.message));
  }, [tab, org]);
  async function work(fn: () => Promise<any>, message = "บันทึกเรียบร้อย") {
    setError("");
    setBusy(true);
    try {
      const r = await fn();
      if (user) await refresh();
      setNotice(message);
      return r;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  function submit(fn: (b: Row) => Promise<any>) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const b = field(e.currentTarget);
      work(() => fn(b))
        .then(() => setModal(""))
        .catch(() => {});
    };
  }
  function open(name: string, d?: Row) {
    setError("");
    setMediaPickerMode(null);
    setPickerSearch("");
    setPickerType("all");
    setFormBranch(d?.branch || user?.branch || data.branches[0]?.id || "");
    setItems(d?.items ? JSON.parse(JSON.stringify(d.items)) : []);
    setDefaultDuration(Number(d?.defaultDuration) || 10);
    setDefaultTransition(d?.defaultTransition || "fade");
    setDefaultSpeed(Number(d?.defaultTransitionSpeed) || 0.8);
    if (name === "schedules" && d && d.targetType) {
      setTargets(d.targets ? [...d.targets] : []);
      setTargetType(d.targetType || "display");
    } else {
      setTargets(d ? [d.id] : []);
      setTargetType("display");
    }
    setDetail(d || null);
    setModal(name);
  }
  const branches = data.branches as Row[],
    displays = data.displays as Row[],
    media = data.media as Row[],
    playlists = data.playlists as Row[],
    schedules = data.schedules as Row[],
    versions = data.versions as Row[];
  const visible = (rows: Row[]) =>
    rows.filter(
      (r) =>
        (!branch || r.branch === branch) &&
        (!query ||
          JSON.stringify([r.name, r.group, r.description])
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
  const totalDisplays = displays.length;
  const onlineDisplays = displays.filter(
    (d) => !d.revoked && Date.now() - d.lastSeen < 90000,
  ).length;
  const offlineDisplays = displays.filter(
    (d) => d.revoked || Date.now() - d.lastSeen >= 90000,
  ).length;
  const repairDisplays = displays.filter(
    (d) =>
      (d.cache?.ready || 0) < (d.cache?.total || 0) || Boolean(d.error),
  ).length;
  const visibleDisplays = displays.filter((d) => {
    const matchBranch = !branch || d.branch === branch;
    const matchQuery =
      !query ||
      JSON.stringify([d.name, d.group, d.id])
        .toLowerCase()
        .includes(query.toLowerCase());
    const online = !d.revoked && Date.now() - d.lastSeen < 90000;
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "online" && online) ||
      (statusFilter === "offline" && !online);
    return matchBranch && matchQuery && matchStatus;
  });
  const isScheduleUsingDefault = (s: Row) => {
    const sPlaylistId =
      versions.find((v) => v.id === s.version)?.playlist || s.playlist;
    return playlists.some((p) => {
      const br = branches.find((b) => b.id === p.branch);
      const isDefault = Boolean(
        p.isDefault || (br && br.fallback === p.published),
      );
      if (!isDefault) return false;
      return (
        (sPlaylistId && sPlaylistId === p.id) ||
        s.version === p.published ||
        s.playlist === p.id ||
        (br && br.fallback === s.version)
      );
    });
  };
  const defaultPlaylists = playlists.filter((p) => {
    const br = branches.find((b) => b.id === p.branch);
    const isDefault = Boolean(p.isDefault || (br && br.fallback === p.published));
    if (!isDefault) return false;
    if (branch && p.branch !== branch) return false;
    if (
      query &&
      !JSON.stringify([p.name, p.description])
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    return true;
  });
  const standaloneDefaultPlaylists = defaultPlaylists.filter((p) => {
    return !visible(schedules).some((s) => {
      const sPlaylistId =
        versions.find((v) => v.id === s.version)?.playlist || s.playlist;
      return (
        (sPlaylistId && sPlaylistId === p.id) ||
        s.version === p.published ||
        s.playlist === p.id ||
        branches.find((b) => b.id === p.branch)?.fallback === s.version
      );
    });
  });
  const lookup = (rows: Row[], id: string) =>
    rows.find((r) => r.id === id)?.name || id;

  const getSchedulePlaylistId = (s: Row) =>
    s.playlist || versions.find((v) => v.id === s.version)?.playlist || "";

  const getPlaylistRelatedSchedules = (p: Row) =>
    schedules.filter((s) => {
      const pid = getSchedulePlaylistId(s);
      return pid === p.id || s.version === p.published;
    });

  const getPlaylistStatusInfo = (p: Row) => {
    const br = branches.find((b) => b.id === p.branch);
    const isDefault = Boolean(br?.fallback === p.published || p.isDefault);
    const related = getPlaylistRelatedSchedules(p);

    const activeSchedule = related.find((s) => {
      const info = getScheduleInfo(s);
      return !info.isExpired && !info.isUpcoming && s.state === "published";
    });
    const upcomingSchedule = related.find((s) => {
      const info = getScheduleInfo(s);
      return info.isUpcoming && s.state === "published";
    });
    const expiredSchedule = related.find((s) => {
      const info = getScheduleInfo(s);
      return info.isExpired && s.state === "published";
    });

    const hasActive = Boolean(activeSchedule);
    const hasUpcoming = Boolean(upcomingSchedule);
    const hasExpired = Boolean(expiredSchedule);
    const isUnscheduled = !isDefault && related.length === 0;

    return {
      isDefault,
      hasActive,
      hasUpcoming,
      hasExpired: isDefault ? false : hasExpired,
      isUnscheduled,
      activeSchedule,
      upcomingSchedule,
      expiredSchedule: isDefault ? undefined : expiredSchedule,
      relatedCount: related.length,
    };
  };

  // Schedule filtering computations
  const effectiveScheduleBranch = scheduleBranch || branch;
  const scopedSchedules = schedules.filter(
    (s) => !effectiveScheduleBranch || s.branch === effectiveScheduleBranch,
  );
  const scopedDefaults = standaloneDefaultPlaylists.filter(
    (p) => !effectiveScheduleBranch || p.branch === effectiveScheduleBranch,
  );

  const scheduleCounts = {
    all: scopedDefaults.length + scopedSchedules.length,
    active:
      scopedDefaults.length +
      scopedSchedules.filter((s) => {
        const info = getScheduleInfo(s);
        return !info.isExpired && !info.isUpcoming && s.state === "published";
      }).length,
    upcoming: scopedSchedules.filter((s) => {
      const info = getScheduleInfo(s);
      return info.isUpcoming && s.state === "published";
    }).length,
    expired: scopedSchedules.filter((s) => {
      const info = getScheduleInfo(s);
      return info.isExpired && s.state === "published";
    }).length,
    default:
      scopedDefaults.length +
      scopedSchedules.filter((s) => isScheduleUsingDefault(s)).length,
    archived: scopedSchedules.filter(
      (s) => s.state === "archived" || s.state === "draft",
    ).length,
  };

  const matchesScheduleSearch = (s: Row) => {
    if (!scheduleSearch) return true;
    const q = scheduleSearch.toLowerCase();
    const vName = lookup(versions, s.version);
    const pName = lookup(playlists, s.playlist);
    const brName = lookup(branches, s.branch);
    const targetText =
      s.targetType === "display"
        ? s.targets.map((id: string) => lookup(displays, id)).join(" ")
        : s.targetType === "group"
          ? `กลุ่ม ${s.group}`
          : s.targetType === "branch"
            ? brName
            : "ทุกจอ";
    return [s.name, vName, pName, brName, targetText].some((txt) =>
      txt?.toLowerCase().includes(q),
    );
  };

  const matchesDefaultSearch = (p: Row) => {
    if (!scheduleSearch) return true;
    const q = scheduleSearch.toLowerCase();
    const brName = lookup(branches, p.branch);
    return [p.name, p.description, brName, "ผังเริ่มต้น", "Default"].some((txt) =>
      txt?.toLowerCase().includes(q),
    );
  };

  const filteredStandaloneDefaults = scopedDefaults.filter((p) => {
    if (["upcoming", "expired", "archived"].includes(scheduleFilter))
      return false;
    return matchesDefaultSearch(p);
  });

  const filteredSchedules = scopedSchedules.filter((s) => {
    if (!matchesScheduleSearch(s)) return false;
    const info = getScheduleInfo(s);
    const isDefault = isScheduleUsingDefault(s);

    if (scheduleFilter === "all") return true;
    if (scheduleFilter === "active")
      return !info.isExpired && !info.isUpcoming && s.state === "published";
    if (scheduleFilter === "upcoming")
      return info.isUpcoming && s.state === "published";
    if (scheduleFilter === "expired")
      return info.isExpired && s.state === "published";
    if (scheduleFilter === "default") return isDefault;
    if (scheduleFilter === "archived")
      return s.state === "archived" || s.state === "draft";
    return true;
  });

  // Playlist filtering computations
  const effectivePlaylistBranch = playlistBranch || branch;
  const scopedPlaylists = playlists.filter(
    (p) => !effectivePlaylistBranch || p.branch === effectivePlaylistBranch,
  );

  const playlistCounts = {
    all: scopedPlaylists.length,
    active: scopedPlaylists.filter(
      (p) => getPlaylistStatusInfo(p).hasActive,
    ).length,
    expired: scopedPlaylists.filter(
      (p) => getPlaylistStatusInfo(p).hasExpired,
    ).length,
    default: scopedPlaylists.filter(
      (p) => getPlaylistStatusInfo(p).isDefault,
    ).length,
    unscheduled: scopedPlaylists.filter(
      (p) => getPlaylistStatusInfo(p).isUnscheduled,
    ).length,
  };

  const matchesPlaylistSearch = (p: Row) => {
    if (!playlistSearch) return true;
    const q = playlistSearch.toLowerCase();
    const brName = lookup(branches, p.branch);
    return [p.name, p.description, brName].some((txt) =>
      txt?.toLowerCase().includes(q),
    );
  };

  const filteredPlaylists = scopedPlaylists.filter((p) => {
    if (!matchesPlaylistSearch(p)) return false;
    const status = getPlaylistStatusInfo(p);

    if (playlistFilter === "all") return true;
    if (playlistFilter === "active") return status.hasActive;
    if (playlistFilter === "expired") return status.hasExpired;
    if (playlistFilter === "default") return status.isDefault;
    if (playlistFilter === "unscheduled") return status.isUnscheduled;
    return true;
  });
  const vItems = (p: Row) =>
    (p.items || []).map((i: Row) => ({
      ...i,
      transition: i.transition || p.defaultTransition || "fade",
      transitionSpeed: i.transitionSpeed || p.defaultTransitionSpeed || 0.8,
      ...(() => {
        const m = media.find((m) => m.id === i.media);
        return { type: m?.type || i.type, name: m?.name || i.name };
      })(),
    }));
  const total = media.reduce((s, m) => s + m.size, 0),
    quota = data.organizations.find((o: Row) => o.id === org)?.quota || 1;
  const branchMedia = media.filter(
    (m) =>
      !m.trashedAt &&
      (user?.role !== "branch" || m.branch === formBranch) &&
      (!formBranch || m.branch === formBranch),
  );
  const filteredPickerMedia = branchMedia.filter((m) => {
    const matchQuery =
      !pickerSearch ||
      (m.name || "").toLowerCase().includes(pickerSearch.toLowerCase());
    const isVid = m.type?.startsWith("video");
    const matchType =
      pickerType === "all" ||
      (pickerType === "video" && isVid) ||
      (pickerType === "image" && !isVid);
    return matchQuery && matchType;
  });
  function act(path: string, b: Row = {}) {
    work(() => api(path, b, org)).catch(() => {});
  }
  function branchField() {
    const selectedBranch = formBranch || branches[0]?.id || "";
    return (
      <label>
        <span className="label-text">
          สาขา <span className="text-danger">*</span>
        </span>
        <select
          name="branch"
          required
          value={selectedBranch}
          onChange={(e) => {
            setFormBranch(e.target.value);
            setTargets([]);
          }}
        >
          {branches.length > 1 && <option value="">เลือกสาขา</option>}
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  async function upload(file: File): Promise<Row> {
    const activeBranch = formBranch || (data.branches as Row[])?.[0]?.id;
    if (!activeBranch) throw new Error("ไม่พบสาขาในระบบ กรุณาสร้างสาขาก่อน");
    if (!formBranch) setFormBranch(activeBranch);
    console.log(`[Upload] Starting file upload: "${file.name}" (${file.size} bytes, type: ${file.type || "unknown"}) to branch: ${activeBranch}`);
    return new Promise<Row>((ok, no) => {
      const x = new XMLHttpRequest();
      x.timeout = 120000;
      x.open(
        "POST",
        `/api/media?org=${org}&branch=${activeBranch}&name=${encodeURIComponent(file.name)}`,
      );
      x.upload.onprogress = (e) => {
        const pct = e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : 0;
        setProgress(pct);
        if (pct % 25 === 0 || pct === 100) {
          console.log(`[Upload Progress] "${file.name}": ${pct}% (${e.loaded}/${e.total} bytes)`);
        }
      };
      x.ontimeout = () => {
        console.error("[Upload Timeout]", file.name);
        no(new Error(`อัปโหลด "${file.name}" หมดเวลา (Timeout 120s): เซิร์ฟเวอร์ไม่ตอบสนอง กรุณาตรวจสอบการเชื่อมต่อหรือลองใหม่อีกครั้ง`));
      };
      x.onabort = () => {
        console.warn("[Upload Aborted]", file.name);
        no(new Error(`การอัปโหลด "${file.name}" ถูกยกเลิก`));
      };
      x.onerror = (ev) => {
        console.error("[Upload Network Error]", file.name, ev);
        no(new Error(`อัปโหลด "${file.name}" ไม่สำเร็จ: การเชื่อมต่อเครือข่ายขัดข้อง (Network Error / Connection Reset)`));
      };
      x.onload = () => {
        if (x.status < 300) {
          try {
            const res = JSON.parse(x.responseText);
            console.log(`[Upload Success] "${file.name}" -> ID: ${res.id}`);
            ok(res);
          } catch {
            ok({ id: "" });
          }
        } else {
          console.error(`[Upload Error] HTTP ${x.status} for "${file.name}":`, x.responseText);
          try {
            const err = JSON.parse(x.responseText);
            no(new Error(err.error || `อัปโหลด "${file.name}" ไม่สำเร็จ (${x.status})`));
          } catch {
            no(new Error(`อัปโหลด "${file.name}" ไม่สำเร็จ (${x.status}): ${x.responseText || "ข้อผิดพลาดที่ไม่ทราบสาเหตุ"}`));
          }
        }
      };
      x.send(file);
    });
  }
  async function handlePlaylistUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const activeBranch = formBranch || (data.branches as Row[])?.[0]?.id;
    if (!activeBranch) {
      setError("ไม่พบสาขาในระบบ กรุณาสร้างสาขาก่อน");
      return;
    }
    if (!formBranch) setFormBranch(activeBranch);
    await work(async () => {
      const newItems: Row[] = [];
      const newMediaList: Row[] = [];
      for (const file of Array.from(files)) {
        const m = await upload(file);
        if (m && m.id) {
          newMediaList.push(m);
          newItems.push({
            media: m.id,
            duration: defaultDuration,
            transition: defaultTransition,
            transitionSpeed: defaultSpeed,
          });
        }
      }
      if (newMediaList.length) {
        setData((d) => ({ ...d, media: [...newMediaList, ...d.media] }));
        setItems((v) => [...v, ...newItems]);
      }
    }, "อัปโหลดและเพิ่มหน้าเข้า Layout เรียบร้อย");
    if (playlistFileRef.current) playlistFileRef.current.value = "";
  }
  async function handlePickerUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const activeBranch = formBranch || (data.branches as Row[])?.[0]?.id;
    if (!activeBranch) {
      setError("ไม่พบสาขาในระบบ กรุณาสร้างสาขาก่อน");
      return;
    }
    if (!formBranch) setFormBranch(activeBranch);
    await work(async () => {
      const file = files[0];
      const m = await upload(file);
      if (m && m.id) {
        setData((d) => ({ ...d, media: [m, ...d.media] }));
        if (mediaPickerMode === "add") {
          setItems((v) => [
            ...v,
            {
              media: m.id,
              duration: defaultDuration,
              transition: defaultTransition,
              transitionSpeed: defaultSpeed,
            },
          ]);
        } else if (typeof mediaPickerMode === "number") {
          setItems((v) =>
            v.map((it, idx) => (idx === mediaPickerMode ? { ...it, media: m.id } : it)),
          );
        }
        setMediaPickerMode(null);
      }
    }, "อัปโหลดและเลือกสื่อเรียบร้อย");
    if (pickerFileRef.current) pickerFileRef.current.value = "";
  }
  async function handleDeleteBranch(b: Row) {
    if (branches.length <= 1) {
      setError("ไม่สามารถลบได้ เนื่องจากองค์กรต้องมีสาขาอย่างน้อย 1 สาขา");
      return;
    }
    const branchDisplays = displays.filter((d) => d.branch === b.id);
    const branchPlaylists = playlists.filter((p) => p.branch === b.id);
    const branchSchedules = schedules.filter((s) => s.branch === b.id);
    const branchMedia = ((data.media as Row[]) || []).filter((m) => m.branch === b.id);

    if (
      branchDisplays.length > 0 ||
      branchPlaylists.length > 0 ||
      branchSchedules.length > 0 ||
      branchMedia.length > 0
    ) {
      const details = [
        branchDisplays.length > 0 ? `${branchDisplays.length} จอ` : "",
        branchPlaylists.length > 0 ? `${branchPlaylists.length} ผัง` : "",
        branchSchedules.length > 0 ? `${branchSchedules.length} ตาราง` : "",
        branchMedia.length > 0 ? `${branchMedia.length} ไฟล์สื่อ` : "",
      ]
        .filter(Boolean)
        .join(", ");
      setError(
        `ไม่สามารถลบสาขา "${b.name}" ได้เนื่องจากยังมีข้อมูลผูกอยู่ (${details}) กรุณาลบหรือย้ายข้อมูลก่อน`,
      );
      return;
    }

    if (
      !confirm(
        `คุณแน่ใจหรือไม่ว่าต้องการลบสาขา "${b.name}"? การดำเนินการนี้ไม่สามารถเรียกคืนได้`,
      )
    ) {
      return;
    }

    await work(async () => {
      await api(`/branches/${b.id}/delete`, {}, org);
      if (formBranch === b.id) {
        const remaining = branches.filter((item) => item.id !== b.id);
        setFormBranch(remaining[0]?.id || "");
      }
    }, `ลบสาขา "${b.name}" เรียบร้อย`);
  }
  async function saveLayout(
    e: React.MouseEvent | React.FormEvent,
    publishNow = false,
    setAsDefault = false,
  ) {
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest("form");
    if (!form) return;
    const b = field(form);
    if (!items.length) {
      setError("กรุณาเพิ่มอย่างน้อย 1 หน้าใน Layout");
      return;
    }
    await work(
      async () => {
        const payload = {
          ...b,
          id: detail?.id,
          defaultDuration,
          defaultTransition,
          defaultTransitionSpeed: defaultSpeed,
          items,
        };
        const p = await api("/playlists", payload, org);
        const layoutId = p?.id || detail?.id;
        if (setAsDefault && layoutId) {
          await api(`/playlists/${layoutId}/set-default`, {}, org);
          return p;
        }
        if (publishNow && layoutId) {
          await api(`/playlists/${layoutId}/publish`, {}, org);
          return p;
        }
        return p;
      },
      setAsDefault
        ? "บันทึกและตั้งเป็นผังเริ่มต้น (Default) เรียบร้อย"
        : publishNow
          ? "บันทึกและ Publish Layout เรียบร้อย"
          : "บันทึก Draft Layout เรียบร้อย",
    )
      .then(() => setModal(""))
      .catch(() => {});
  }
  function exportCSV() {
    const rows = report.daily;
    const cols = ["day", "device", "media", "count", "seconds", "last"];
    const csv =
      "\uFEFF" +
      cols.join(",") +
      "\n" +
      rows
        .map((r: Row) =>
          cols
            .map((k) => '"' + String(r[k] ?? "").replaceAll('"', '""') + '"')
            .join(","),
        )
        .join("\n");
    const u = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "proof-of-play.csv";
    a.click();
    URL.revokeObjectURL(u);
  }
  if (!user)
    return (
      <main className="auth">
        <div className="auth-brand">
          <span className="logo">S</span>
          <h1>Shotel</h1>
          <p>Hotel Digital Signage</p>
        </div>
        <form
          className="auth-card"
          onSubmit={(e) => {
            e.preventDefault();
            const b = field(e.currentTarget);
            work(() => api(boot?.needsSetup ? "/setup" : "/login", b))
              .then((u) => {
                setUser(u);
                setOrg(u.org);
              })
              .catch(() => {});
          }}
        >
          <h2>
            {boot?.needsSetup ? "ตั้งค่าผู้ดูแลระบบครั้งแรก" : "เข้าสู่ระบบ"}
          </h2>
          {boot?.needsSetup && (
            <>
              <label>
                ชื่อองค์กร
                <input name="organization" required />
              </label>
              <label>
                ชื่อผู้ดูแล
                <input name="name" required />
              </label>
            </>
          )}
          <label>
            อีเมล
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            รหัสผ่าน
            <input
              name="password"
              type="password"
              minLength={boot?.needsSetup ? 12 : undefined}
              required
              autoComplete={
                boot?.needsSetup ? "new-password" : "current-password"
              }
            />
          </label>
          {boot?.needsSetup && (
            <small>
              สร้างบัญชีแรกจาก localhost · รหัสผ่านอย่างน้อย 12 ตัวอักษร
            </small>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={busy || !boot} className="primary full">
            {busy
              ? "กำลังดำเนินการ…"
              : boot?.needsSetup
                ? "สร้างระบบ"
                : "เข้าสู่ระบบ"}
          </button>
        </form>
      </main>
    );
  const nav: [string, string, typeof Monitor][] = [
    ["overview", "ภาพรวม", LayoutDashboard],
    ["displays", "จัดการจอ", Monitor],
    ["schedules", "ตารางแสดงงาน", CalendarDays],
    ["layouts", "เพลย์ลิสต์", ListVideo],
    ["branches", "สาขา", Building2],
    ["reports", "รายงาน", BarChart3],
    ["settings", "การจัดเก็บ", HardDrive],
    ...(user.role === "branch" ? [] : [["users", "ผู้ใช้งาน", Users] as [string, string, typeof Monitor]]),
  ];
  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand">
          <span className="logo">S</span>
          <div>
            <strong>Shotel</strong>
            <small style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}>Hotel Signage</small>
          </div>
        </div>
        <select
          aria-label="องค์กร"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
        >
          {data.organizations.map((o: Row) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setQuery("");
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="profile">
          <strong>{user.name}</strong>
          <small>
            {user.role} · {user.email}
          </small>
          <button
            onClick={() =>
              api("/logout", {}).then(() => {
                setUser(null);
                setData(initial);
              })
            }
          >
            <LogOut size={16} /> ออกจากระบบ
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <span className="muted" style={{ fontWeight: 500, color: "#64768b" }}>
            {lookup(data.organizations, org)} &nbsp; / &nbsp; {branch ? lookup(branches, branch) : "ทุกสาขา"}
          </span>
          <span className="muted" style={{ fontWeight: 500, color: "#64768b" }}>
            DEMO WORKSPACE &nbsp; • &nbsp; {user.role === "platform" ? "ผู้ดูแลระบบ" : user.role === "organization" ? "ผู้ดูแลองค์กร" : "ผู้ดูแลสาขา"}
          </span>
        </header>
        <div className="page">
          <div className="heading">
            <div>
              <span className="eyebrow">SHOTEL CONSOLE</span>
              <h1>{tab === "displays" ? "จัดการจอแสดงผล" : nav.find((n) => n[0] === tab)?.[1]}</h1>
              <p>
                {tab === "displays"
                  ? "เชื่อมต่อจอ เลือกงาน และติดตามการแสดงผลของทุกสาขาได้จากที่เดียว"
                  : tab === "layouts"
                    ? "สร้างและจัดลำดับหน้า พร้อมใส่ภาพ/วิดีโอและเอฟเฟคเปลี่ยนหน้า"
                    : tab === "schedules"
                      ? "เลือกผังแสดงผล จอเป้าหมาย และช่วงเวลาเผยแพร่"
                      : "ข้อมูลจากเซิร์ฟเวอร์ของคุณ"}
              </p>
            </div>
            <div className="actions">
              <button
                onClick={() => refresh().catch((e) => setError(e.message))}
                aria-label="รีเฟรช"
              >
                <RefreshCw size={17} />
              </button>
              {[
                "displays",
                "layouts",
                "schedules",
                "branches",
                "users",
              ].includes(tab) &&
                !(tab === "branches" && user.role === "branch") && (
                  <button className="primary" onClick={() => open(tab)}>
                    <Plus size={17} />
                    {
                      (
                        {
                          displays: "ลงทะเบียนจอ",
                          layouts: "สร้าง Layout ใหม่",
                          schedules: "สร้าง Schedule",
                          branches: "เพิ่มสาขา",
                          users: "เพิ่มผู้ใช้",
                        } as Row
                      )[tab]
                    }
                  </button>
                )}
            </div>
          </div>
          {/* Floating Toast Notification with Slide-Away Animations */}
          <div className="toast-container" aria-live="polite">
            {notice && (
              <ToastNotification
                key={"notice-" + notice}
                message={notice}
                type="notice"
                duration={3500}
                onClose={() => setNotice("")}
              />
            )}
            {error && (
              <ToastNotification
                key={"error-" + error}
                message={error}
                type="error"
                duration={6000}
                onClose={() => setError("")}
              />
            )}
          </div>
          {tab === "overview" && (
            <>
              <div className="stats">
                {[
                  ["Displays", displays.length],
                  [
                    "ออนไลน์",
                    displays.filter(
                      (d) => !d.revoked && Date.now() - d.lastSeen < 90000,
                    ).length,
                  ],
                  [
                    "Cache มีปัญหา",
                    displays.filter((d) =>
                      ["DEGRADED", "CRITICAL"].includes(d.health),
                    ).length,
                  ],
                  ["พื้นที่สื่อ", size(total)],
                ].map(([label, value]) => (
                  <article className="panel" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </article>
                ))}
              </div>
              <section className="panel">
                <h2>การแจ้งเตือนล่าสุด</h2>
                {!data.events.length ? (
                  <p className="empty">ยังไม่มีการแจ้งเตือนจาก Player</p>
                ) : (
                  data.events.slice(0, 12).map((e: Row) => (
                    <div className="event" key={e.id}>
                      <span
                        className={
                          "badge " +
                          (e.health === "HEALTHY" ? "green" : "amber")
                        }
                      >
                        {e.health}
                      </span>
                      <div>
                        <strong>{lookup(displays, e.device)}</strong>
                        <p>{e.message}</p>
                      </div>
                      <small>{when(e.at)}</small>
                    </div>
                  ))
                )}
              </section>
              <section className="panel">
                <h2>เริ่มใช้งาน</h2>
                <div className="steps">
                  {[
                    ["branches", "1 · เพิ่มสาขา"],
                    ["layouts", "2 · สร้าง Layouts (ผังแสดงผล)"],
                    ["displays", "3 · เปิด Player และจับคู่จอ"],
                    ["schedules", "4 · ตั้ง Schedule หรือใช้ผังเริ่มต้น"],
                  ].map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === "displays" && (
            <>
              <div className="fleet-summary">
                <div className="fleet-card">
                  <span className="fleet-card-number">{totalDisplays}</span>
                  <span className="fleet-card-label">จอทั้งหมด</span>
                </div>
                <div className="fleet-card">
                  <span
                    className="fleet-card-number"
                    style={{ color: "#00897d" }}
                  >
                    {onlineDisplays}
                  </span>
                  <span className="fleet-card-label">ออนไลน์</span>
                </div>
                <div className="fleet-card">
                  <span
                    className="fleet-card-number"
                    style={{ color: "#64768b" }}
                  >
                    {offlineDisplays}
                  </span>
                  <span className="fleet-card-label">ออฟไลน์</span>
                </div>
                <div className="fleet-card">
                  <span
                    className="fleet-card-number"
                    style={{
                      color: repairDisplays > 0 ? "#e11d48" : "#64768b",
                    }}
                  >
                    {repairDisplays}
                  </span>
                  <span className="fleet-card-label">ไฟล์ต้องซ่อมแซม</span>
                </div>
              </div>

              <div className="display-filters-bar">
                <label className="filter-item search">
                  <span className="filter-label">ค้นหาจอ</span>
                  <input
                    placeholder="ชื่อจอ หรือรหัสอุปกรณ์"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="filter-item">
                  <span className="filter-label">สาขา</span>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  >
                    <option value="">ทุกสาขา</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-item">
                  <span className="filter-label">การเชื่อมต่อ</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="online">ออนไลน์</option>
                    <option value="offline">ออฟไลน์</option>
                  </select>
                </label>
                <div className="filter-counter">
                  แสดง {visibleDisplays.length} จาก {displays.length} จอ
                </div>
              </div>

              <div className="cards display-cards-grid">
                {visibleDisplays.map((d) => {
                  const isOnline = !d.revoked && Date.now() - d.lastSeen < 90000;
                  const currentMediaName = lookup(media, d.current?.media);
                  const cacheReady = d.cache?.ready ?? 0;
                  const cacheTotal = d.cache?.total ?? 0;
                  const cachePct = cacheTotal > 0 ? Math.round((cacheReady / cacheTotal) * 100) : 0;

                  return (
                    <article className="panel display-card" key={d.id}>
                      {/* Header: Device Avatar + Name + Tags + Status */}
                      <div className="display-card-header">
                        <div className="display-identity">
                          <div className={`display-icon-avatar ${isOnline ? "online" : "offline"}`}>
                            <Monitor size={22} />
                          </div>
                          <div className="display-title-group">
                            <h3 className="display-name" title={d.name}>{d.name}</h3>
                            <div className="display-meta-tags">
                              <span className="display-tag branch-tag">{lookup(branches, d.branch)}</span>
                              <span className="display-tag group-tag">{d.group || "ไม่มีกลุ่ม"}</span>
                            </div>
                          </div>
                        </div>
                        <div className="display-status-wrap">
                          <Badge d={d} />
                        </div>
                      </div>

                      {/* Now Playing Banner */}
                      <div className="display-now-playing">
                        <div className="now-playing-bar">
                          <span className="now-playing-label">
                            <Play size={11} fill="currentColor" /> กำลังแสดงผล (Now Playing)
                          </span>
                        </div>
                        <div className="now-playing-value" title={currentMediaName || "ไม่มีสื่อที่กำลังเล่น"}>
                          <ListVideo size={16} className="now-playing-media-icon" />
                          <span className="media-title">{currentMediaName || "— ไม่มีสื่อที่กำลังเล่น (สแตนด์บาย) —"}</span>
                        </div>
                      </div>

                      {/* Details / Stats Grid */}
                      <div className="display-info-grid">
                        <div className="info-cell">
                          <span className="info-label">
                            <Clock size={13} /> เชื่อมต่อล่าสุด
                          </span>
                          <span className="info-val">{when(d.lastSeen)}</span>
                        </div>
                        <div className="info-cell">
                          <span className="info-label">
                            <HardDrive size={13} /> สื่อออฟไลน์ (แคช)
                          </span>
                          <span className="info-val">
                            <strong>{cacheReady} / {cacheTotal}</strong> ไฟล์
                            {cacheTotal > 0 && (
                              <span className={`cache-pill ${cacheReady === cacheTotal ? "ready" : ""}`}>
                                {cachePct}%
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="info-cell full-span">
                          <span className="info-label">
                            <Images size={13} /> ภาพถ่ายหน้าจอล่าสุด
                          </span>
                          <span className="info-val">
                            {d.screenshotAt ? when(d.screenshotAt) : "ยังไม่มีภาพบันทึก"}
                          </span>
                        </div>
                      </div>

                      {d.error && (
                        <div className="display-error-box">
                          <span>⚠️ {d.error}</span>
                        </div>
                      )}

                      {/* Footer: Preview Action Button */}
                      <div className="display-card-footer">
                        <button
                          className="display-preview-btn"
                          onClick={() => {
                            const m = {
                              schedules: schedules
                                .filter(
                                  (s) =>
                                    s.state === "published" &&
                                    (s.targets?.includes(d.id) ||
                                      (s.targetType === "branch" &&
                                        s.branch === d.branch) ||
                                      (s.targetType === "group" &&
                                        s.group === d.group &&
                                        s.branch === d.branch) ||
                                      s.targetType === "organization"),
                                )
                                .map((s) => ({
                                  ...s,
                                  snapshot: versions.find((v) => v.id === s.version),
                                  specificity: (
                                    {
                                      display: 4,
                                      group: 3,
                                      branch: 2,
                                      organization: 1,
                                    } as Row
                                  )[s.targetType],
                                })),
                              fallback: versions.find(
                                (v) =>
                                  v.id ===
                                  (d.fallback ||
                                    branches.find((br) => br.id === d.branch)
                                      ?.fallback),
                              ),
                            };
                            const p = selectProgram(m, new Date());
                            const prog = p || m.fallback;
                            if (prog && prog.items && prog.items.length) {
                              setPreview(vItems(prog));
                            } else {
                              setError(
                                "จอนี้ยังไม่มีสื่อหรือผังรายการที่พร้อมแสดง (ไม่มีงานในตารางเวลาและไม่มีผังเริ่มต้น)",
                              );
                            }
                          }}
                        >
                          <Play size={16} fill="currentColor" />
                          <span>ดูภาพตัวอย่างสด (Preview)</span>
                        </button>
                        <button
                          className="btn-layout-delete"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`คุณต้องการลบจอ "${d.name}" ออกจากระบบอย่างถาวร ใช่หรือไม่?`)) {
                              act(`/displays/${d.id}/delete`);
                            }
                          }}
                          title="ลบจอนี้"
                          style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#e11d48", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}
                        >
                          <Trash2 size={16} /> เลิกจับคู่ / ลบจอ
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!visibleDisplays.length && (
                <p className="empty">ไม่พบจอแสดงผลตามเงื่อนไขที่เลือก</p>
              )}
              <div className="banner" style={{ marginTop: 24 }}>
                <Monitor size={30} />
                <div>
                  <h3 style={{ margin: "0 0 4px" }}>เปิด Player บนจอที่ต้องการลงทะเบียน</h3>
                  <p style={{ margin: 0 }}>
                    เปิดแอปพลิเคชัน Shotel Player บนกล่อง Android หรือจอปลายทาง แล้วนำรหัส 6 หลักมากรอกที่ปุ่ม “+ ลงทะเบียนจอ”
                  </p>
                </div>
              </div>
            </>
          )}
          {tab === "layouts" && (
            <>
              <div className="filter-toolbar">
                <div className="filter-controls-row">
                  <div className="filter-inputs-group">
                    <div className="filter-search-wrap">
                      <Search size={16} />
                      <input
                        type="text"
                        placeholder="ค้นหาเพลย์ลิสต์ (ชื่อผัง, รายละเอียด)..."
                        value={playlistSearch}
                        onChange={(e) => setPlaylistSearch(e.target.value)}
                      />
                      {playlistSearch && (
                        <button
                          type="button"
                          className="filter-clear-btn"
                          onClick={() => setPlaylistSearch("")}
                          aria-label="ล้างคำค้นหา"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {branches.length > 1 && (
                      <select
                        className="filter-branch-select"
                        value={playlistBranch}
                        onChange={(e) => setPlaylistBranch(e.target.value)}
                        aria-label="กรองสาขา"
                      >
                        <option value="">ทุกสาขา ({branches.length})</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="filter-counter-text">
                    แสดง {filteredPlaylists.length} จาก {scopedPlaylists.length} เพลย์ลิสต์
                  </div>
                </div>

                <div className="filter-chips-row">
                  <button
                    type="button"
                    className={`filter-chip-btn ${playlistFilter === "all" ? "active" : ""}`}
                    onClick={() => setPlaylistFilter("all")}
                  >
                    <span>ทั้งหมด</span>
                    <span className="filter-chip-badge">{playlistCounts.all}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${playlistFilter === "active" ? "active" : ""}`}
                    onClick={() => setPlaylistFilter("active")}
                  >
                    <span>🟢 กำลังมีคิวงาน</span>
                    <span className="filter-chip-badge">{playlistCounts.active}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${playlistFilter === "expired" ? "active" : ""}`}
                    onClick={() => setPlaylistFilter("expired")}
                  >
                    <span>⛔ งานหมดอายุแล้ว</span>
                    <span className="filter-chip-badge">{playlistCounts.expired}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${playlistFilter === "default" ? "active" : ""}`}
                    onClick={() => setPlaylistFilter("default")}
                  >
                    <span>⭐ ผังเริ่มต้น</span>
                    <span className="filter-chip-badge">{playlistCounts.default}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${playlistFilter === "unscheduled" ? "active" : ""}`}
                    onClick={() => setPlaylistFilter("unscheduled")}
                  >
                    <span>📂 ยังไม่ผูกคิวงาน</span>
                    <span className="filter-chip-badge">{playlistCounts.unscheduled}</span>
                  </button>
                </div>
              </div>

              <div className="cards layout-cards-grid">
                {filteredPlaylists.map((p) => {
                  const br = branches.find((b) => b.id === p.branch);
                  const isBranchDefault =
                    br?.fallback === p.published || p.isDefault;
                  const totalDur = (p.items || []).reduce(
                    (s: number, it: Row) => s + (Number(it.duration) || 10),
                    0,
                  );
                  const status = getPlaylistStatusInfo(p);
                  return (
                    <article className="panel layout-card" key={p.id}>
                      {/* Card Header: Avatar + Title + Branch/Default Tags + Status Pill */}
                      <div className="layout-card-header">
                        <div className="layout-identity">
                          <div
                            className={`layout-icon-avatar ${isBranchDefault ? "is-default" : ""}`}
                          >
                            <ListVideo size={22} />
                          </div>
                          <div className="layout-title-group">
                            <h3 className="layout-name" title={p.name}>
                              {p.name}
                            </h3>
                            <div className="layout-meta-tags">
                              <span className="layout-tag branch-tag">
                                {lookup(branches, p.branch)}
                              </span>
                              {isBranchDefault && (
                                <span className="layout-tag default-tag">
                                  ⭐ ผังเริ่มต้น
                                </span>
                              )}
                              {status.hasActive && (
                                <span
                                  className="layout-tag active-tag"
                                  title={`มีงานตารางกำลังเล่นอยู่: ${status.activeSchedule?.name || ""}`}
                                >
                                  🟢 กำลังแสดงในตาราง
                                </span>
                              )}
                              {!status.hasActive && status.hasUpcoming && (
                                <span
                                  className="layout-tag upcoming-tag"
                                  title={`มีงานรอเริ่ม: ${status.upcomingSchedule?.name || ""}`}
                                >
                                  🕒 รอเริ่มตามตาราง
                                </span>
                              )}
                              {!status.hasActive && !status.hasUpcoming && status.hasExpired && (
                                <span
                                  className="layout-tag expired-tag"
                                  title={`งานในตารางหมดอายุแล้ว: ${status.expiredSchedule?.name || ""}`}
                                >
                                  ⛔ งานในตารางหมดอายุแล้ว
                                </span>
                              )}
                              {status.isUnscheduled && (
                                <span className="layout-tag unscheduled-tag">
                                  📂 ยังไม่ผูกตารางงาน
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="layout-status-wrap">
                          <span
                            className={`badge status-pill ${p.published ? "green" : "gray"}`}
                          >
                            <span className="status-dot" />
                            <span>
                              {p.published ? "Published" : "Draft"}
                            </span>
                          </span>
                        </div>
                      </div>

                      {p.description && (
                        <p className="layout-desc">{p.description}</p>
                      )}

                      {/* Summary Strip */}
                      <div className="layout-summary-strip">
                        <div className="summary-chip">
                          <span className="chip-icon">📄</span>
                          <span>
                            <strong>{p.items?.length || 0}</strong> หน้า (Pages)
                          </span>
                        </div>
                        <div className="summary-chip">
                          <span className="chip-icon">⏱️</span>
                          <span>
                            เวลารวม ~<strong>{totalDur}</strong> วิ
                          </span>
                        </div>
                        <div className="summary-chip loop-chip">
                          <span className="chip-icon">🔄</span>
                          <span>เล่นวนลูป</span>
                        </div>
                      </div>

                      {/* Pages Preview List */}
                      <div className="layout-pages-container">
                        <div className="layout-pages-list">
                          {(p.items || []).slice(0, 5).map((i: Row, n: number) => {
                            const m = media.find((item) => item.id === i.media);
                            const isVideo = m?.type?.startsWith("video") || m?.name?.toLowerCase().endsWith(".mp4");
                            return (
                              <div className="layout-page-row" key={n}>
                                <div className="page-row-main">
                                  <span className="page-seq-badge">{n + 1}</span>
                                  <span className="page-type-emoji">
                                    {isVideo ? "🎬" : "🖼️"}
                                  </span>
                                  <span
                                    className="page-filename"
                                    title={lookup(media, i.media)}
                                  >
                                    {lookup(media, i.media)}
                                  </span>
                                </div>
                                <div className="page-row-timing">
                                  <span className="page-timing-pill">
                                    {isVideo ? "🎬 ตามคลิป" : `${i.duration}s`} ·{" "}
                                    {i.transition || p.defaultTransition || "fade"}{" "}
                                    ({i.transitionSpeed ||
                                      p.defaultTransitionSpeed ||
                                      0.8}
                                    s)
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {(p.items || []).length > 5 && (
                          <div className="layout-pages-more">
                            ...และอีก {p.items.length - 5} หน้าในผังนี้
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      <div className="layout-card-footer">
                        <div className="layout-main-actions">
                          <button
                            className="btn-layout-preview"
                            onClick={() => setPreview(vItems(p))}
                            title="ดูตัวอย่างการแสดงผลผังนี้"
                          >
                            <Play size={14} fill="currentColor" /> Preview
                          </button>
                          <button
                            className="btn-layout-edit"
                            onClick={() => open("layouts", p)}
                            title="แก้ไขผังและปรับหน้า"
                          >
                            ✏️ แก้ไขผัง / ปรับหน้า
                          </button>
                        </div>
                        <div className="layout-secondary-actions">
                          {!isBranchDefault && (
                            <button
                              className="btn-layout-default"
                              disabled={busy}
                              onClick={() => act(`/playlists/${p.id}/set-default`)}
                              title="ตั้ง Layout นี้เป็นผังเริ่มต้นของสาขา (เล่นอัตโนมัติเมื่อไม่มี Schedule)"
                            >
                              <Star size={13} /> ตั้งเป็น Default
                            </button>
                          )}
                          <button
                            className="btn-layout-publish"
                            disabled={busy}
                            onClick={() => act(`/playlists/${p.id}/publish`)}
                            title="เผยแพร่ผังเวอร์ชันล่าสุด"
                          >
                            Publish
                          </button>
                          <button
                            className="btn-layout-delete"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `คุณต้องการลบ Layout "${p.name}" ใช่หรือไม่?`,
                                )
                              ) {
                                act(`/playlists/${p.id}/delete`);
                              }
                            }}
                            title="ลบ Layout นี้"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!filteredPlaylists.length && (
                <p className="empty">
                  {scopedPlaylists.length === 0
                    ? "ยังไม่มี Layout ในรายการ กดปุ่ม \"+ สร้าง Layout ใหม่\" เพื่อเริ่มต้น"
                    : "ไม่พบ Layout ตามเงื่อนไขตัวกรองที่เลือก (ลองเปลี่ยนตัวกรองหรือล้างคำค้นหา)"}
                </p>
              )}
            </>
          )}
          {tab === "schedules" && (
            <>
              <div className="filter-toolbar">
                <div className="filter-controls-row">
                  <div className="filter-inputs-group">
                    <div className="filter-search-wrap">
                      <Search size={16} />
                      <input
                        type="text"
                        placeholder="ค้นหาตารางงาน (ชื่องาน, ผัง, จอเป้าหมาย)..."
                        value={scheduleSearch}
                        onChange={(e) => setScheduleSearch(e.target.value)}
                      />
                      {scheduleSearch && (
                        <button
                          type="button"
                          className="filter-clear-btn"
                          onClick={() => setScheduleSearch("")}
                          aria-label="ล้างคำค้นหา"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {branches.length > 1 && (
                      <select
                        className="filter-branch-select"
                        value={scheduleBranch}
                        onChange={(e) => setScheduleBranch(e.target.value)}
                        aria-label="กรองสาขา"
                      >
                        <option value="">ทุกสาขา ({branches.length})</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="filter-counter-text">
                    แสดง {filteredStandaloneDefaults.length + filteredSchedules.length} จาก {scheduleCounts.all} งาน
                  </div>
                </div>

                <div className="filter-chips-row">
                  <button
                    type="button"
                    className={`filter-chip-btn ${scheduleFilter === "all" ? "active" : ""}`}
                    onClick={() => setScheduleFilter("all")}
                  >
                    <span>ทั้งหมด</span>
                    <span className="filter-chip-badge">{scheduleCounts.all}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${scheduleFilter === "active" ? "active" : ""}`}
                    onClick={() => setScheduleFilter("active")}
                  >
                    <span>🟢 กำลังเผยแพร่</span>
                    <span className="filter-chip-badge">{scheduleCounts.active}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${scheduleFilter === "upcoming" ? "active" : ""}`}
                    onClick={() => setScheduleFilter("upcoming")}
                  >
                    <span>🕒 รอเริ่มตามเวลา</span>
                    <span className="filter-chip-badge">{scheduleCounts.upcoming}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${scheduleFilter === "expired" ? "active" : ""}`}
                    onClick={() => setScheduleFilter("expired")}
                  >
                    <span>⛔ หมดอายุแล้ว</span>
                    <span className="filter-chip-badge">{scheduleCounts.expired}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${scheduleFilter === "default" ? "active" : ""}`}
                    onClick={() => setScheduleFilter("default")}
                  >
                    <span>⭐ ผังเริ่มต้น</span>
                    <span className="filter-chip-badge">{scheduleCounts.default}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-chip-btn ${scheduleFilter === "archived" ? "active" : ""}`}
                    onClick={() => setScheduleFilter("archived")}
                  >
                    <span>📦 จัดเก็บแล้ว</span>
                    <span className="filter-chip-badge">{scheduleCounts.archived}</span>
                  </button>
                </div>
              </div>

              <section className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ชื่องาน / Layout</th>
                      <th>จอเป้าหมาย</th>
                      <th>รอบเวลาแสดงผล</th>
                      <th>วันหมดอายุ / สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStandaloneDefaults.map((p) => {
                    const totalDur = (p.items || []).reduce(
                      (s: number, it: Row) => s + (Number(it.duration) || 10),
                      0,
                    );
                    return (
                      <tr
                        key={`default-${p.id}`}
                        className="schedule-default-row"
                        style={{ background: "#f8fafc" }}
                      >
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <strong>{p.name}</strong>
                            <span
                              className="badge amber"
                              style={{ fontSize: 11, padding: "2px 8px" }}
                            >
                              ⭐ ผังเริ่มต้น (Default)
                            </span>
                          </div>
                          <small
                            className="muted"
                            style={{ display: "block", marginTop: 4 }}
                          >
                            📄 {p.items?.length || 0} หน้า · รวม ~{totalDur}{" "}
                            วินาที · เล่นวนอัตโนมัติ
                          </small>
                        </td>
                        <td>
                          <strong>
                            ทุกจอในสาขา {lookup(branches, p.branch)}
                          </strong>
                          <small
                            className="muted"
                            style={{ display: "block", marginTop: 2 }}
                          >
                            เล่นอัตโนมัติเมื่อไม่มีคิวงานตามเวลา
                          </small>
                        </td>
                        <td>
                          <strong style={{ color: "#00897d" }}>
                            ตลอดเวลา (24 ชม.)
                          </strong>
                          <small
                            style={{
                              display: "block",
                              color: "#64748b",
                              marginTop: 2,
                            }}
                          >
                            ทุกวัน · เล่นวนต่อเนื่องเมื่อไม่มี Schedule
                          </small>
                        </td>
                        <td>
                          <div>
                            <span className="badge green">🟢 ผังเริ่มต้น</span>
                            <span
                              className="schedule-expire-text"
                              style={{
                                display: "block",
                                color: "#00897d",
                                fontWeight: 600,
                                marginTop: 4,
                              }}
                            >
                              ✨ ไม่มีวันหมดอายุ (เล่นตลอดไป)
                            </span>
                            <small
                              className="muted"
                              style={{ display: "block", marginTop: 2 }}
                            >
                              สแตนด์บายตลอดเวลาจนกว่าจะเปลี่ยนผังเริ่มต้น
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="actions wrap">
                            <button
                              className="primary"
                              onClick={() => setPreview(vItems(p))}
                              title="ดูตัวอย่างการแสดงผลผังเริ่มต้นนี้"
                            >
                              <Play size={13} /> Preview
                            </button>
                            <button
                              onClick={() => open("layouts", p)}
                              title="แก้ไขหน้าและสื่อในผังนี้"
                            >
                              ✏️ แก้ไขผัง
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSchedules.map((s) => {
                    const info = getScheduleInfo(s);
                    const isAllDay = s.startTime === s.endTime;
                    const isDefault = isScheduleUsingDefault(s);
                    return (
                      <tr key={s.id}>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <strong>{s.name}</strong>
                            {isDefault && (
                              <span
                                className="badge amber"
                                style={{ fontSize: 11, padding: "2px 8px" }}
                              >
                                ⭐ ผังเริ่มต้น (Default)
                              </span>
                            )}
                          </div>
                          <small
                            className="muted"
                            style={{ display: "block", marginTop: 2 }}
                          >
                            📄 {lookup(versions, s.version)}
                          </small>
                        </td>
                        <td>
                          {s.targetType === "display"
                            ? s.targets
                                .map((id: string) => lookup(displays, id))
                                .join(", ")
                            : s.targetType === "group"
                              ? "กลุ่ม " + s.group
                              : s.targetType === "branch"
                                ? lookup(branches, s.branch)
                                : "ทุกจอในองค์กร"}
                        </td>
                        <td>
                          <strong>
                            {isAllDay
                              ? "ตลอดวัน (24 ชม.)"
                              : `${s.startTime} – ${s.endTime}`}
                          </strong>
                          <small
                            style={{
                              display: "block",
                              color: "#64748b",
                              marginTop: 2,
                            }}
                          >
                            {s.days.map((n: number) => days[n]).join(" ")} ·{" "}
                            {s.timezone}
                          </small>
                        </td>
                        <td>
                          {isDefault ? (
                            <div>
                              <span className="badge green">🟢 ผังเริ่มต้น</span>
                              <span
                                className="schedule-expire-text"
                                style={{
                                  display: "block",
                                  color: "#00897d",
                                  fontWeight: 600,
                                  marginTop: 4,
                                }}
                              >
                                ✨ ไม่มีวันหมดอายุ (เล่นตลอดไป)
                              </span>
                              <small
                                className="muted"
                                style={{ display: "block", marginTop: 2 }}
                              >
                                สแตนด์บายตลอดเวลาจนกว่าจะเปลี่ยนผังเริ่มต้น
                              </small>
                            </div>
                          ) : (
                            <div>
                              <span className={info.badgeClass}>
                                {info.badgeLabel}
                              </span>
                              <span
                                className={`schedule-expire-text ${info.expireClass}`}
                              >
                                {info.expireText}
                              </span>
                              <small
                                className="muted"
                                style={{ display: "block", marginTop: 2 }}
                              >
                                สิ้นสุด: {info.endDateTimeStr}
                              </small>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="actions wrap">
                            <button
                              onClick={() => {
                                const ver = versions.find((v) => v.id === s.version);
                                setPreview(ver ? vItems(ver) : []);
                              }}
                              title="ดูตัวอย่างการแสดงผล"
                            >
                              <Play size={13} /> Preview
                            </button>
                            <button
                              onClick={() => open("schedules", s)}
                              title="แก้ไขตารางเวลานี้"
                            >
                              ✏️ แก้ไข
                            </button>
                            <button
                              onClick={() =>
                                act(
                                  `/schedules/${s.id}/${s.state === "published" ? "archive" : "publish"}`,
                                )
                              }
                            >
                              {s.state === "published" ? "Archive" : "Publish"}
                            </button>
                            <button
                              className="danger"
                              onClick={() => {
                                if (
                                  confirm(
                                    `คุณต้องการลบ Schedule "${s.name}" หรือไม่?`,
                                  )
                                ) {
                                  act(`/schedules/${s.id}/delete`);
                                }
                              }}
                              title="ลบ Schedule นี้"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filteredStandaloneDefaults.length && !filteredSchedules.length && (
                <p className="empty">
                  {scopedDefaults.length === 0 && scopedSchedules.length === 0
                    ? "ยังไม่มีงานในตารางแสดงผล กดปุ่ม \"+ สร้าง Schedule\" เพื่อเริ่มต้น"
                    : "ไม่พบงานในตารางตามเงื่อนไขตัวกรองที่เลือก (ลองเปลี่ยนตัวกรองหรือล้างคำค้นหา)"}
                </p>
              )}
              <p className="muted">
                💡 <strong>ลำดับการแสดงผล:</strong> คิวงานที่มี Schedule
                จะเล่นตามเวลาที่ระบุ หากไม่มีงานตามตาราง จอจะเล่น{" "}
                <strong>⭐ ผังเริ่มต้น (Default)</strong> อัตโนมัติโดยไม่มีวันหมดอายุ
              </p>
            </section>
          </>
        )}
          {tab === "branches" && (
            <div className="cards branch-cards-grid">
              {branches.map((b) => {
                const branchDisplays = displays.filter((d) => d.branch === b.id);
                const branchPlaylists = playlists.filter((p) => p.branch === b.id);
                const branchSchedules = schedules.filter((s) => s.branch === b.id);
                const isOnlyBranch = branches.length <= 1;

                return (
                  <article className="panel branch-card" key={b.id}>
                    <div className="branch-card-header">
                      <div className="branch-identity">
                        <div className="branch-icon-avatar">
                          <Building2 size={22} />
                        </div>
                        <div className="branch-title-group">
                          <h2 className="branch-name">{b.name}</h2>
                          <span className="badge gray branch-tz-badge">
                            {b.timezone || "Asia/Bangkok"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="branch-stats-grid">
                      <div className="branch-stat-item">
                        <Monitor size={15} className="branch-stat-icon text-teal" />
                        <span className="branch-stat-val">{branchDisplays.length}</span>
                        <span className="branch-stat-lbl">จอแสดงผล</span>
                      </div>
                      <div className="branch-stat-item">
                        <ListVideo size={15} className="branch-stat-icon text-indigo" />
                        <span className="branch-stat-val">{branchPlaylists.length}</span>
                        <span className="branch-stat-lbl">Layout / ผัง</span>
                      </div>
                      <div className="branch-stat-item">
                        <CalendarDays size={15} className="branch-stat-icon text-amber" />
                        <span className="branch-stat-val">{branchSchedules.length}</span>
                        <span className="branch-stat-lbl">ตารางเวลา</span>
                      </div>
                    </div>

                    {user.role !== "branch" && (
                      <div className="branch-card-footer">
                        {isOnlyBranch ? (
                          <span
                            className="branch-primary-badge"
                            title="สาขาหลักขององค์กร ต้องมีอย่างน้อย 1 สาขา"
                          >
                            ⭐ สาขาหลัก
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="branch-del-btn"
                            disabled={busy}
                            onClick={() => handleDeleteBranch(b)}
                            title={`ลบสาขา ${b.name}`}
                          >
                            <Trash2 size={14} /> ลบสาขา
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {tab === "users" && (
            <section className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ชื่อ</th>
                    <th>อีเมล</th>
                    <th>สิทธิ์</th>
                    <th>สาขา</th>
                    {user?.role !== "branch" && <th style={{ textAlign: "right" }}>จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u: Row) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                      <td>{lookup(branches, u.branch) || "ทุกสาขา"}</td>
                      {user?.role !== "branch" && (
                        <td style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                          <button
                            type="button"
                            className="btn-icon"
                            title="แก้ไข"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
                            onClick={() => {
                              setDetail(u);
                              setModal("editUser");
                            }}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon danger"
                            title="ลบ"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#e11d48" }}
                            onClick={() => {
                              if (confirm(`คุณต้องการลบผู้ใช้ ${u.name} ใช่หรือไม่?`)) {
                                act(`/users/${u.id}`, undefined, "DELETE");
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {tab === "reports" && (
            <>
              <section className="panel table-wrap">
                <div className="row">
                  <h2>Proof-of-play · รายวัน (UTC)</h2>
                  <button onClick={exportCSV}>Export CSV</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>วัน</th>
                      <th>จอ</th>
                      <th>สื่อ</th>
                      <th>ครั้ง</th>
                      <th>วินาที</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.daily.map((r: Row) => (
                      <tr key={r.day + r.device + r.media}>
                        <td>{r.day}</td>
                        <td>{lookup(displays, r.device)}</td>
                        <td>{lookup(media, r.media)}</td>
                        <td>{r.count}</td>
                        <td>{Math.round(r.seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!report.daily.length && (
                  <p className="empty">Player จะส่งยอดหลังเล่นสื่อจบ</p>
                )}
              </section>
              <section className="panel">
                <h2>Audit log</h2>
                {report.audit.slice(0, 100).map((r: Row) => (
                  <p key={r.id}>
                    {when(r.at)} · {r.action} · {lookup(data.users, r.user)}
                  </p>
                ))}
              </section>
            </>
          )}
          {tab === "settings" && (
            <section className="panel">
              <HardDrive />
              <h2>จัดเก็บข้อมูลบนเซิร์ฟเวอร์</h2>
              <p>
                {size(total)} / {size(quota)} (
                {Math.round((total / quota) * 100)}%)
              </p>
              <progress value={total} max={quota} />
              <p>
                สื่อ รายละเอียดงาน และ Published versions เก็บถาวร งาน Archived
                ยังค้นหาและเผยแพร่ซ้ำได้
              </p>
              <p>
                ถังขยะ 30 วัน · ข้อมูลการเล่นดิบ 90 วัน · สรุปรายวัน 24 เดือน ·
                เหตุการณ์ 180 วัน · Audit 12 เดือน · Screenshot ล่าสุดต่อจอ
              </p>
              <p>
                Heartbeat เก็บเฉพาะสถานะล่าสุดเพื่อลดพื้นที่ ระบบตรวจ Cache ทุก
                30 วินาทีเมื่อ Player ทำงานและซ่อมไฟล์ที่หายอัตโนมัติ
              </p>
              <p>
                Backup: ใช้คำสั่ง npm run backup
                และนำโฟลเดอร์สำรองไปเก็บในอุปกรณ์อีกชุดหนึ่ง
              </p>
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <h3 style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Clock size={18} /> บันทึกระบบ & Error Logs
                </h3>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.9rem" }}>
                  ดูประวัติข้อผิดพลาดและการทำงานของเซิร์ฟเวอร์แบบเรียลไทม์ (บันทึกใน <code>data/error.log</code>)
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={loadLogs}
                  disabled={busy}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Clock size={15} /> ดูบันทึกระบบ & Error Logs ล่าสุด
                </button>
              </div>
              {user.role === "platform" && (
                <button onClick={() => open("organizations")} style={{ marginTop: 16 }}>
                  เพิ่มองค์กร
                </button>
              )}
            </section>
          )}
        </div>
      </main>
      {modal && (
        <Modal
          title={
            (
              {
                displays: "ลงทะเบียน Display",
                layouts: detail ? "แก้ไข Layout (ผังการแสดงผล)" : "สร้าง Layout ใหม่ (ผังการแสดงผล)",
                playlists: detail ? "แก้ไข Layout (ผังการแสดงผล)" : "สร้าง Layout ใหม่ (ผังการแสดงผล)",
                schedules: detail ? "แก้ไข Schedule (ตารางเวลา)" : "สร้าง Schedule ใหม่ (ตารางเวลา)",
                branches: "เพิ่มสาขา",
                users: "เพิ่มผู้ใช้งาน",
                editUser: "แก้ไขผู้ใช้งาน",
                organizations: "เพิ่มองค์กร",
                editDisplay: "ตั้งค่าจอ",
                schedulePreview: "จำลองการแสดงตามเวลา",
                viewScreenshot: "ภาพหน้าจอ: " + (detail?.name || ""),
                systemLogs: "บันทึกระบบ & Error Logs (data/error.log)",
              } as Row
            )[modal]
          }
          onClose={() => {
            if (!busy) {
              setModal("");
              setMediaPickerMode(null);
            }
          }}
        >
          {modal === "displays" && (
            <form onSubmit={submit((b) => api("/displays", b, org))}>
              <p>เปิดแอป Shotel Player บนจอปลายทางก่อน แล้วใช้รหัสที่จอนั้นแสดง</p>
              <label>
                รหัสจับคู่
                <input
                  name="code"
                  maxLength={6}
                  required
                  placeholder="เช่น ABC123"
                />
              </label>
              <label>
                ชื่อ Display
                <input
                  name="name"
                  required
                  placeholder="เช่น หน้าลิฟต์ ชั้น 1"
                />
              </label>
              <label>
                กลุ่ม
                <input name="group" placeholder="เช่น Lobby, Restaurant" />
              </label>
              <label>
                Resolution
                <select name="resolution">
                  <option value="1920x1080">1920x1080 (แนวนอน FHD)</option>
                  <option value="1080x1920">1080x1920 (แนวตั้ง FHD)</option>
                  <option value="3840x2160">3840x2160 (4K UHD)</option>
                </select>
              </label>
              {branchField()}
              <button disabled={busy} className="primary">
                จับคู่
              </button>
            </form>
          )}
          {modal === "branches" && (
            <form onSubmit={submit((b) => api("/branches", b, org))}>
              <label>
                ชื่อสาขา
                <input name="name" required placeholder="เช่น สาขาสาทร" />
              </label>
              <label>
                Timezone
                <input name="timezone" defaultValue="Asia/Bangkok" required />
              </label>
              <button disabled={busy} className="primary">
                สร้างสาขา
              </button>
            </form>
          )}
          {modal === "organizations" && (
            <form onSubmit={submit((b) => api("/organizations", b, org))}>
              <label>
                ชื่อองค์กร
                <input name="name" required />
              </label>
              <label>
                Domain
                <input name="domain" required />
              </label>
              <label>
                Quota สื่อ (ไบต์)
                <input
                  name="quota"
                  type="number"
                  defaultValue={20 * 1024 * 1024 * 1024}
                />
              </label>
              <button className="primary" disabled={busy}>
                สร้างองค์กร
              </button>
            </form>
          )}
          {modal === "users" && (
            <form onSubmit={submit((b) => api("/users", b, org))}>
              <label>
                ชื่อ
                <input name="name" required />
              </label>
              <label>
                อีเมล
                <input name="email" type="email" required />
              </label>
              <label>
                รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label>
                สิทธิ์
                <select name="role">
                  <option value="branch">ผู้ดูแลสาขา</option>
                  <option value="organization">ผู้ดูแลองค์กร</option>
                </select>
              </label>
              {branchField()}
              <button className="primary" disabled={busy}>
                สร้างผู้ใช้
              </button>
            </form>
          )}
          {modal === "editUser" && detail && (
            <form onSubmit={submit((b) => api(`/users/${detail.id}`, b, org, "PUT"))}>
              <label>
                ชื่อ
                <input name="name" required defaultValue={detail.name} />
              </label>
              <label>
                อีเมล (แก้ไขไม่ได้)
                <input name="email" value={detail.email} disabled />
              </label>
              <label>
                รหัสผ่านใหม่ <small>(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</small>
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  placeholder="********"
                  autoComplete="new-password"
                />
              </label>
              <label>
                สิทธิ์
                <select name="role" defaultValue={detail.role} onChange={(e) => setDetail({...detail, role: e.target.value})}>
                  <option value="branch">ผู้ดูแลสาขา</option>
                  <option value="organization">ผู้ดูแลองค์กร</option>
                </select>
              </label>
              {detail.role === "branch" && branchField()}
              <button className="primary" disabled={busy}>
                บันทึกการแก้ไข
              </button>
            </form>
          )}
          {(modal === "layouts" || modal === "playlists") && (
            <form onSubmit={(e) => saveLayout(e, false, false)}>
              <div className="two form-grid-2">
                <label>
                  <span className="label-text">
                    ชื่อ Layout <span className="text-danger">*</span>
                  </span>
                  <input
                    name="name"
                    required
                    defaultValue={detail?.name || ""}
                    placeholder="เช่น ผังต้อนรับล็อบบี้, โปรโมชั่นห้องอาหาร"
                  />
                </label>
                {branchField()}
              </div>

              <div className="layout-description-group">
                <div className="description-label-row">
                  <span className="label-text">รายละเอียดผัง (Description)</span>
                  <span className="optional-tag">ไม่บังคับ</span>
                </div>
                <textarea
                  name="description"
                  className="layout-description-box"
                  rows={3}
                  defaultValue={detail?.description || ""}
                  placeholder="ระบุคำอธิบายสั้นๆ ของผัง เช่น ภาพโปรโมชั่นห้องพักและวิดีโอแนะนำสิ่งอำนวยความสะดวกสำหรับล็อบบี้..."
                />
                <span className="description-sub-hint">
                  💡 คำอธิบายช่วยให้ทีมงานเข้าใจวัตถุประสงค์และตำแหน่งการนำผังรายการนี้ไปใช้งานได้สะดวกรวดเร็ว
                </span>
              </div>

              {/* การตั้งค่าเริ่มต้นสำหรับแต่ละหน้า */}
              <fieldset className="layout-defaults-box">
                <legend className="fieldset-legend">
                  ⚙️ ค่าเริ่มต้นสำหรับแต่ละหน้า (Duration & Transition Defaults)
                </legend>
                <div className="layout-defaults-grid">
                  <label>
                    <span className="label-text">ระยะเวลาต่อหน้า (วิ)</span>
                    <input
                      type="number"
                      min={1}
                      max={3600}
                      value={defaultDuration}
                      onChange={(e) => setDefaultDuration(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    <span className="label-text">เอฟเฟกต์เปลี่ยนหน้า</span>
                    <select
                      value={defaultTransition}
                      onChange={(e) => setDefaultTransition(e.target.value)}
                    >
                      <option value="fade">✨ เฟด (Fade)</option>
                      <option value="slide">➡️ สไลด์ซ้าย (Slide)</option>
                      <option value="zoom">🔍 ซูมเข้า (Zoom)</option>
                      <option value="none">⏹️ ไม่มี (None)</option>
                    </select>
                  </label>
                  <label>
                    <span className="label-text">ความเร็วเปลี่ยนหน้า</span>
                    <select
                      value={defaultSpeed}
                      onChange={(e) => setDefaultSpeed(Number(e.target.value))}
                    >
                      <option value={0.4}>⚡ เร็ว 0.4s</option>
                      <option value={0.8}>⏱️ ปกติ 0.8s</option>
                      <option value={1.5}>🐢 ช้า 1.5s</option>
                      <option value={2.5}>🍃 นุ่มนวล 2.5s</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              {/* แถบเพิ่มหน้าสื่อเข้า Layout */}
              <div className="playlist-add-card">
                <div className="add-card-header">
                  <div className="add-card-title-group">
                    <span className="add-card-badge-icon">➕</span>
                    <div>
                      <strong className="add-card-heading">เพิ่มหน้าสื่อเข้าสู่ Layout</strong>
                      <p className="add-card-subtext">
                        เลือกภาพหรือวิดีโอจากคลังสื่อของสาขา หรืออัปโหลดไฟล์ใหม่เพื่อเพิ่มเป็นหน้าถัดไป
                      </p>
                    </div>
                  </div>
                  <div className="add-card-actions">
                    <input
                      type="file"
                      ref={playlistFileRef}
                      multiple
                      accept="image/jpeg,image/png,image/webp,video/mp4,.jpg,.jpeg,.png,.webp,.mp4"
                      style={{ display: "none" }}
                      onChange={(e) => handlePlaylistUpload(e.target.files)}
                    />
                    <button
                      type="button"
                      className="btn-add-page"
                      disabled={busy}
                      onClick={() => {
                        if (!formBranch) {
                          setError("กรุณาเลือกสาขาก่อนอัปโหลดสื่อ");
                          return;
                        }
                        playlistFileRef.current?.click();
                      }}
                    >
                      <Upload size={16} />
                      <span>+ อัปโหลดไฟล์ใหม่เข้าผัง (Add Page)</span>
                    </button>

                    <button
                      type="button"
                      className="btn-upload-secondary"
                      onClick={() => {
                        if (!formBranch) {
                          setError("กรุณาเลือกสาขาก่อนเพิ่มหน้า");
                          return;
                        }
                        setPickerSearch("");
                        setPickerType("all");
                        setMediaPickerMode("add");
                      }}
                    >
                      <Images size={15} />
                      <span>เลือกจากคลังสื่อ ({branchMedia.length})</span>
                    </button>
                  </div>
                </div>
                {busy && <progress className="upload-progress-bar" value={progress} max={100} />}
              </div>

              {/* รายการหน้าใน Layout */}
              <div className="playlist-queue-header">
                <div className="queue-title-group">
                  <span className="queue-badge-icon">📄</span>
                  <strong>หน้ารายการใน Layout ({items.length} หน้า)</strong>
                </div>
                <div className="queue-actions-group">
                  <button
                    type="button"
                    className="btn-mini-add-page"
                    onClick={() => {
                      if (!formBranch) {
                        setError("กรุณาเลือกสาขาก่อนเพิ่มหน้า");
                        return;
                      }
                      setPickerSearch("");
                      setPickerType("all");
                      setMediaPickerMode("add");
                    }}
                  >
                    <Plus size={13} /> เพิ่มหน้า (Add Page)
                  </button>
                  {items.length > 0 && (
                    <button
                      type="button"
                      className="btn-clear-all"
                      onClick={() => setItems([])}
                    >
                      <Trash2 size={12} /> ล้างทุกหน้า
                    </button>
                  )}
                </div>
              </div>

              {!items.length ? (
                <div className="layout-empty-queue">
                  <Images size={36} />
                  <p>ยังไม่มีหน้าใน Layout</p>
                  <small>กดปุ่ม <strong>+ Add Page</strong> หรืออัปโหลดไฟล์ใหม่เพื่อเริ่มจัดผัง</small>
                  <div>
                    <button
                      type="button"
                      className="btn-add-page btn-empty-add"
                      onClick={() => {
                        if (!formBranch) {
                          setError("กรุณาเลือกสาขาก่อนเพิ่มหน้า");
                          return;
                        }
                        setPickerSearch("");
                        setPickerType("all");
                        setMediaPickerMode("add");
                      }}
                    >
                      <Plus size={15} /> กด Add Page สร้างหน้าแรก
                    </button>
                  </div>
                </div>
              ) : (
                <div className="layout-pages-editor-list">
                  {items.map((i, n) => {
                    const m = media.find((item) => item.id === i.media);
                    const isVideo = m?.type?.startsWith("video") || m?.name?.toLowerCase().endsWith(".mp4");
                    return (
                      <div className="layout-page-card" key={n}>
                        <div className="layout-page-left">
                          <span className="layout-page-index">หน้า {n + 1}</span>
                          <div
                            className="layout-page-thumb-wrapper"
                            title="คลิกเพื่อเปลี่ยนสื่อ (Edit/Swap Media)"
                            onClick={() => {
                              setPickerSearch("");
                              setPickerType("all");
                              setMediaPickerMode(n);
                            }}
                          >
                            {isVideo ? (
                              <div className="layout-page-thumb video" title="วิดีโอ">
                                <Play size={16} fill="currentColor" />
                              </div>
                            ) : (
                              <img
                                src={"/api/media/" + i.media + "/file"}
                                alt=""
                                className="layout-page-thumb"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = "none";
                                }}
                              />
                            )}
                            <div className="thumb-edit-overlay">
                              <Edit3 size={13} />
                            </div>
                          </div>
                          <div className="layout-page-info">
                            <strong className="page-filename" title={lookup(media, i.media)}>
                              {lookup(media, i.media)}
                            </strong>
                            <div className="page-meta-row">
                              <small className="page-type-muted">
                                {isVideo ? "🎬 วิดีโอ" : "🖼️ รูปภาพ"}
                              </small>
                              <button
                                type="button"
                                className="btn-swap-media"
                                title="เปลี่ยนสื่อสำหรับหน้านี้ (Edit/Swap Media)"
                                onClick={() => {
                                  setPickerSearch("");
                                  setPickerType("all");
                                  setMediaPickerMode(n);
                                }}
                              >
                                <RefreshCw size={11} />
                                <span>เปลี่ยนสื่อ</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="layout-page-controls-grid">
                          {isVideo ? (
                            <div className="page-control-item" title="วิดีโอจะเล่นตามความยาวไฟล์อัตโนมัติจนจบ">
                              <span className="control-label">การเล่น</span>
                              <div className="video-duration-badge">
                                🎬 เล่นตามความยาวคลิป (จนจบ)
                              </div>
                            </div>
                          ) : (
                            <label className="page-control-item" title="ระยะเวลาแสดงผลหน้านี้ (วินาที)">
                              <span className="control-label">เวลา</span>
                              <div className="input-with-unit">
                                <input
                                  aria-label={"ระยะเวลาหน้า " + (n + 1)}
                                  type="number"
                                  min={1}
                                  max={3600}
                                  className="input-duration"
                                  value={i.duration || defaultDuration}
                                  onChange={(e) =>
                                    setItems((v) =>
                                      v.map((it, k) =>
                                        k === n
                                          ? { ...it, duration: Number(e.target.value) }
                                          : it,
                                      ),
                                    )
                                  }
                                />
                                <span className="unit-label">วิ</span>
                              </div>
                            </label>
                          )}

                          <label className="page-control-item" title="เอฟเฟกต์เปลี่ยนหน้า">
                            <span className="control-label">เอฟเฟกต์</span>
                            <select
                              value={i.transition || defaultTransition}
                              onChange={(e) =>
                                setItems((v) =>
                                  v.map((it, k) =>
                                    k === n
                                      ? { ...it, transition: e.target.value }
                                      : it,
                                  ),
                                )
                              }
                            >
                              <option value="fade">✨ เฟด (Fade)</option>
                              <option value="slide">➡️ สไลด์ (Slide)</option>
                              <option value="zoom">🔍 ซูม (Zoom)</option>
                              <option value="none">⏹️ ไม่มี (None)</option>
                            </select>
                          </label>

                          <label className="page-control-item" title="ความเร็วเปลี่ยนหน้า">
                            <span className="control-label">สปีด</span>
                            <select
                              className="speed-select"
                              value={i.transitionSpeed || defaultSpeed}
                              onChange={(e) =>
                                setItems((v) =>
                                  v.map((it, k) =>
                                    k === n
                                      ? { ...it, transitionSpeed: Number(e.target.value) }
                                      : it,
                                  ),
                                )
                              }
                            >
                              <option value={0.4}>⚡ เร็ว 0.4s</option>
                              <option value={0.8}>⏱️ ปกติ 0.8s</option>
                              <option value={1.5}>🐢 ช้า 1.5s</option>
                              <option value={2.5}>🍃 นุ่ม 2.5s</option>
                            </select>
                          </label>
                        </div>

                        <div className="layout-page-btns">
                          <button
                            type="button"
                            className="btn-order"
                            aria-label="เลื่อนขึ้น"
                            title="เลื่อนขึ้น"
                            disabled={!n}
                            onClick={() =>
                              setItems((v) => {
                                const a = [...v];
                                [a[n - 1], a[n]] = [a[n], a[n - 1]];
                                return a;
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn-order"
                            aria-label="เลื่อนลง"
                            title="เลื่อนลง"
                            disabled={n === items.length - 1}
                            onClick={() =>
                              setItems((v) => {
                                const a = [...v];
                                [a[n], a[n + 1]] = [a[n + 1], a[n]];
                                return a;
                              })
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-label="ลบหน้านี้"
                            className="btn-delete-page"
                            title="ลบหน้านี้ออกจากผัง"
                            onClick={() =>
                              setItems((v) => v.filter((_, k) => k !== n))
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="layout-editor-hint">
                💡 รูปภาพจะแสดงผลตามระยะเวลาที่กำหนด ส่วนวิดีโอจะเล่นต่อเนื่องจนจบไฟล์ก่อนเปลี่ยนหน้าถัดไปตามเอฟเฟคและความเร็วที่เลือก
              </p>

              <div className="layout-actions-row">
                <button
                  type="button"
                  disabled={busy || !items.length}
                  className="btn-action-draft"
                  onClick={(e) => saveLayout(e, false, false)}
                >
                  บันทึก Draft
                </button>
                <button
                  type="button"
                  disabled={busy || !items.length}
                  className="btn-action-publish"
                  onClick={(e) => saveLayout(e, true, false)}
                >
                  บันทึกและ Publish
                </button>
                <button
                  type="button"
                  disabled={busy || !items.length}
                  className="btn-action-default"
                  title="บันทึก เผยแพร่ และตั้งเป็นผังเริ่มต้นที่จะเล่นเมื่อไม่มีงาน Schedule อื่น"
                  onClick={(e) => saveLayout(e, true, true)}
                >
                  <Star size={14} /> บันทึกและตั้งเป็นผังเริ่มต้น (Set Default)
                </button>
              </div>

              {/* Media Picker Dialog */}
              {mediaPickerMode !== null && (
                <div
                  className="media-picker-backdrop"
                  onClick={() => setMediaPickerMode(null)}
                >
                  <div
                    className="media-picker-dialog"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="media-picker-header">
                      <div className="picker-title-group">
                        <span className="picker-badge-icon">
                          {mediaPickerMode === "add" ? "➕" : "✏️"}
                        </span>
                        <div>
                          <h3>
                            {mediaPickerMode === "add"
                              ? "เลือกสื่อเพื่อเพิ่มหน้าใน Layout (Add Page)"
                              : `เปลี่ยนสื่อสำหรับหน้า ${mediaPickerMode + 1}`}
                          </h3>
                          <p className="picker-subtext">
                            {mediaPickerMode === "add"
                              ? "เลือกภาพหรือวิดีโอจากคลังสื่อของสาขานี้เพื่อเพิ่มเป็นหน้าใหม่"
                              : `เลือกไฟล์ใหม่เพื่อแทนที่ "${lookup(media, items[mediaPickerMode]?.media)}"`}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="picker-close-btn"
                        onClick={() => setMediaPickerMode(null)}
                        aria-label="ปิด"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="media-picker-toolbar">
                      <div className="picker-search-box">
                        <Search size={15} />
                        <input
                          type="text"
                          placeholder="ค้นหาชื่อสื่อในสาขา..."
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          autoFocus
                        />
                        {pickerSearch && (
                          <button
                            type="button"
                            className="btn-clear-search"
                            onClick={() => setPickerSearch("")}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>

                      <div className="picker-filter-chips">
                        <button
                          type="button"
                          className={`chip ${pickerType === "all" ? "active" : ""}`}
                          onClick={() => setPickerType("all")}
                        >
                          ทั้งหมด ({branchMedia.length})
                        </button>
                        <button
                          type="button"
                          className={`chip ${pickerType === "image" ? "active" : ""}`}
                          onClick={() => setPickerType("image")}
                        >
                          🖼️ ภาพ ({branchMedia.filter((m) => !m.type?.startsWith("video")).length})
                        </button>
                        <button
                          type="button"
                          className={`chip ${pickerType === "video" ? "active" : ""}`}
                          onClick={() => setPickerType("video")}
                        >
                          🎬 วิดีโอ ({branchMedia.filter((m) => m.type?.startsWith("video")).length})
                        </button>
                      </div>

                      <div className="picker-upload-action">
                        <input
                          type="file"
                          ref={pickerFileRef}
                          accept="image/jpeg,image/png,image/webp,video/mp4,.jpg,.jpeg,.png,.webp,.mp4"
                          style={{ display: "none" }}
                          onChange={(e) => handlePickerUpload(e.target.files)}
                        />
                        <button
                          type="button"
                          className="btn-picker-upload"
                          disabled={busy}
                          onClick={() => pickerFileRef.current?.click()}
                        >
                          <Upload size={14} />
                          <span>อัปโหลดไฟล์ใหม่</span>
                        </button>
                      </div>
                    </div>

                    {busy && <progress className="upload-progress-bar" value={progress} max={100} />}

                    <div className="media-picker-grid">
                      {!filteredPickerMedia.length ? (
                        !branchMedia.length ? (
                          <div
                            className="picker-empty-dropzone"
                            onClick={() => pickerFileRef.current?.click()}
                          >
                            <div className="dropzone-icon">📤</div>
                            <h4>ยังไม่มีไฟล์สื่อในคลัง — คลิกที่นี่เพื่อเลือกไฟล์</h4>
                            <p>
                              รองรับภาพ JPEG, PNG, WebP และวิดีโอ MP4 (ระบบจะอัปโหลดและเพิ่มเข้าหน้านี้ให้อัตโนมัติ)
                            </p>
                            <button
                              type="button"
                              className="primary"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                pointerEvents: "none",
                              }}
                            >
                              <Upload size={15} /> เลือกไฟล์จากเครื่องของคุณ
                            </button>
                          </div>
                        ) : (
                          <div className="picker-empty-state">
                            <Images size={40} />
                            <p style={{ fontWeight: 600, fontSize: "1rem", color: "#1e293b", margin: "8px 0 4px" }}>
                              ไม่พบไฟล์สื่อที่ตรงกับคำค้นหา
                            </p>
                            <small style={{ color: "#64748b" }}>ลองลบคำค้นหา หรือกดเลือกตัวกรอง "ทั้งหมด"</small>
                          </div>
                        )
                      ) : (
                        filteredPickerMedia.map((m) => {
                          const isVid = m.type?.startsWith("video");
                          const isCurrent =
                            typeof mediaPickerMode === "number" &&
                            items[mediaPickerMode]?.media === m.id;
                          return (
                            <div
                              key={m.id}
                              className={`picker-media-card ${isCurrent ? "is-current" : ""}`}
                              onClick={() => {
                                if (mediaPickerMode === "add") {
                                  setItems((v) => [
                                    ...v,
                                    {
                                      media: m.id,
                                      duration: defaultDuration,
                                      transition: defaultTransition,
                                      transitionSpeed: defaultSpeed,
                                    },
                                  ]);
                                } else if (typeof mediaPickerMode === "number") {
                                  setItems((v) =>
                                    v.map((it, idx) =>
                                      idx === mediaPickerMode ? { ...it, media: m.id } : it,
                                    ),
                                  );
                                }
                                setMediaPickerMode(null);
                              }}
                            >
                              <div className="card-thumb-holder">
                                {isVid ? (
                                  <div className="card-thumb-video">
                                    <Play size={22} fill="currentColor" />
                                  </div>
                                ) : (
                                  <img
                                    src={"/api/media/" + m.id + "/file"}
                                    alt={m.name}
                                    className="card-thumb-img"
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = "none";
                                    }}
                                  />
                                )}
                                <span className={`card-type-badge ${isVid ? "video" : "image"}`}>
                                  {isVid ? "🎬 MP4" : "🖼️ ภาพ"}
                                </span>
                                {isCurrent && (
                                  <span className="card-current-badge">
                                    <Check size={11} /> ใช้อยู่
                                  </span>
                                )}
                              </div>
                              <div className="card-info">
                                <strong className="card-name" title={m.name}>
                                  {m.name}
                                </strong>
                                <div className="card-meta">
                                  <span>{size(m.size)}</span>
                                  <span className="card-select-hint">
                                    {isCurrent ? "เลือกซ้ำ" : "คลิกเลือก"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="media-picker-footer">
                      <span className="picker-count-hint">
                        แสดง {filteredPickerMedia.length} จากทั้งหมด {branchMedia.length} สื่อในสาขา
                      </span>
                      <button
                        type="button"
                        className="btn-picker-cancel"
                        onClick={() => setMediaPickerMode(null)}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}
          {modal === "schedules" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const b = field(e.currentTarget);
                const ds = new FormData(e.currentTarget)
                  .getAll("days")
                  .map(Number);
                const state =
                  (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                    "value",
                  ) || (detail ? detail.state : "draft");
                work(
                  () =>
                    api(
                      "/schedules",
                      { ...b, id: detail?.id, days: ds, targets, targetType, state },
                      org,
                    ),
                  detail ? "บันทึกการแก้ไข Schedule เรียบร้อย" : "สร้าง Schedule เรียบร้อย",
                )
                  .then(() => setModal(""))
                  .catch(() => {});
              }}
            >
              <label>
                ชื่องาน <span className="text-danger">*</span>
                <input
                  name="name"
                  required
                  defaultValue={detail?.name || ""}
                  placeholder="เช่น ต้อนรับเช้าวันธรรมดา, ผังพิเศษวันหยุด"
                />
              </label>
              <label>
                Layout ที่จะแสดงผล <span className="text-danger">*</span>
                <select
                  name="playlist"
                  required
                  defaultValue={
                    detail?.version
                      ? (playlists.find((p) => p.published === detail.version || p.id === detail.playlist || p.id === detail.version)?.id || "")
                      : (detail?.playlist || "")
                  }
                >
                  <option value="">-- เลือก Layout ที่ Publish แล้ว --</option>
                  {playlists
                    .filter((p) => p.published)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.isDefault ? "⭐ (Default)" : ""} ({p.items?.length || 0} หน้า)
                      </option>
                    ))}
                </select>
              </label>
              <label>
                ชนิดเป้าหมาย
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                >
                  <option value="display">เลือกจอรายเครื่อง</option>
                  <option value="group">กลุ่มจอในสาขา</option>
                  <option value="branch">ทุกจอในสาขา</option>
                  {user.role !== "branch" && (
                    <option value="organization">ทุกจอในองค์กร</option>
                  )}
                </select>
              </label>
              {targetType !== "organization" ? (
                branchField()
              ) : (
                <label>
                  Timezone
                  <input name="timezone" defaultValue={detail?.timezone || "Asia/Bangkok"} required />
                </label>
              )}
              {targetType === "display" && (
                <fieldset>
                  <legend>จอเป้าหมาย ({targets.length})</legend>
                  {displays
                    .filter((d) => d.branch === formBranch && !d.revoked)
                    .map((d) => (
                      <label className="check" key={d.id}>
                        <input
                          type="checkbox"
                          checked={targets.includes(d.id)}
                          onChange={(e) =>
                            setTargets((v) =>
                              e.target.checked
                                ? [...v, d.id]
                                : v.filter((id) => id !== d.id),
                            )
                          }
                        />
                        {d.name}
                      </label>
                    ))}
                </fieldset>
              )}
              {targetType === "group" && (
                <label>
                  กลุ่ม
                  <select name="group" defaultValue={detail?.group || ""} required>
                    <option value="">เลือกกลุ่ม</option>
                    {[
                      ...new Set(
                        displays
                          .filter((d) => d.branch === formBranch && d.group)
                          .map((d) => d.group),
                      ),
                    ].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="two">
                <label>
                  วันเริ่ม
                  <input
                    type="date"
                    name="startDate"
                    required
                    defaultValue={detail?.startDate || new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  วันสิ้นสุด (วันหมดอายุ) <span className="text-danger">*</span>
                  <input
                    type="date"
                    name="endDate"
                    required
                    defaultValue={detail?.endDate || ""}
                  />
                </label>
                <label>
                  เวลาเริ่ม
                  <input
                    type="time"
                    name="startTime"
                    defaultValue={detail?.startTime || "00:00"}
                    required
                  />
                </label>
                <label>
                  เวลาสิ้นสุด (เวลาหมดอายุ)
                  <input
                    type="time"
                    name="endTime"
                    defaultValue={detail?.endTime || "00:00"}
                    required
                  />
                </label>
              </div>
              <fieldset>
                <legend>วันในสัปดาห์</legend>
                <div className="week">
                  {days.map((d, n) => (
                    <label className="check" key={d}>
                      <input
                        type="checkbox"
                        name="days"
                        value={n}
                        defaultChecked={detail?.days ? detail.days.includes(n) : true}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="muted">
                💡 ตารางที่ซ้อนกันระดับเดียวกันใช้รายการ Publish ล่าสุด · เวลาเริ่มเท่ากับสิ้นสุดหมายถึงตลอดวัน (24 ชม.)
              </p>
              <div className="actions" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                {detail ? (
                  <button
                    type="submit"
                    value={detail.state || "published"}
                    className="primary"
                    disabled={busy}
                  >
                    💾 บันทึกการแก้ไข Schedule
                  </button>
                ) : (
                  <>
                    <button type="submit" value="draft" disabled={busy}>
                      บันทึก Draft
                    </button>
                    <button
                      type="submit"
                      value="published"
                      disabled={busy}
                      className="primary"
                    >
                      Publish Schedule ทันที
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
          {modal === "editDisplay" && detail && (
            <form
              onSubmit={submit((b) =>
                api(`/displays/${detail.id}/edit`, b, org),
              )}
            >
              <label>
                ชื่อจอ
                <input name="name" required defaultValue={detail.name} />
              </label>
              <label>
                กลุ่ม
                <input name="group" defaultValue={detail.group} />
              </label>
              <label>
                Default Playlist เมื่อไม่มี Schedule
                <select
                  name="fallback"
                  defaultValue={
                    versions.find((v) => v.id === detail.fallback)?.playlist ||
                    ""
                  }
                >
                  <option value="">ไม่กำหนด</option>
                  {playlists
                    .filter((p) => p.published)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.isDefault ? "⭐ (Default)" : ""} ({p.items?.length || 0} หน้า)
                      </option>
                    ))}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                บันทึก
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      "ยกเลิกสิทธิ์จอนี้? จอต้องจับคู่ใหม่เพื่อรับงานอีกครั้ง",
                    )
                  )
                    work(() => api(`/displays/${detail.id}/revoke`, {}, org))
                      .then(() => setModal(""))
                      .catch(() => {});
                }}
              >
                ยกเลิกสิทธิ์จอ
              </button>
            </form>
          )}
          {modal === "schedulePreview" && detail && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const b = field(e.currentTarget);
                const m = {
                  schedules: schedules
                    .filter(
                      (s) =>
                        s.state === "published" &&
                        (s.targets.includes(detail.id) ||
                          (s.targetType === "branch" &&
                            s.branch === detail.branch) ||
                          (s.targetType === "group" &&
                            s.group === detail.group &&
                            s.branch === detail.branch) ||
                          s.targetType === "organization"),
                    )
                    .map((s) => ({
                      ...s,
                      snapshot: versions.find((v) => v.id === s.version),
                      specificity: (
                        {
                          display: 4,
                          group: 3,
                          branch: 2,
                          organization: 1,
                        } as Row
                      )[s.targetType],
                    })),
                  fallback: versions.find((v) => v.id === detail.fallback),
                };
                const p = selectProgram(m, new Date(String(b.at)));
                setPreview(p ? vItems(p) : []);
                setModal("");
              }}
            >
              <p>{detail.name}</p>
              <label>
                วันที่และเวลา (Timezone ของเครื่องที่เปิด CMS)
                <input name="at" type="datetime-local" required />
              </label>
              <button className="primary">Preview งานที่ถูกเลือก</button>
            </form>
          )}
          {modal === "viewScreenshot" && detail && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  aspectRatio: "16/9",
                  background: "#060b13",
                  borderRadius: 10,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #1e293b",
                }}
              >
                {detail.screenshotAt ? (
                  <img
                    alt={"ภาพล่าสุดของ " + detail.name}
                    src={`/api/displays/${detail.id}/screenshot?t=${detail.screenshotAt}`}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>
                    <Monitor size={48} style={{ opacity: 0.4, marginBottom: 10 }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>ยังไม่มีภาพถ่ายหน้าจอจากจอนี้</p>
                    <small className="muted" style={{ display: "block", marginTop: 4 }}>
                      กดปุ่ม "ขอภาพใหม่จากจอ" เพื่อส่งสัญญาณให้ Player ถ่ายและส่งภาพกลับมา
                    </small>
                  </div>
                )}
              </div>
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  padding: "4px 2px",
                }}
              >
                <div style={{ fontSize: 13, color: "#475569" }}>
                  <span>ภาพล่าสุด: <strong>{detail.screenshotAt ? when(detail.screenshotAt) : "ไม่มีภาพ"}</strong></span>
                  <span style={{ margin: "0 8px" }}>·</span>
                  <span>สื่อที่กำลังเล่น: <strong>{lookup(media, detail.current?.media) || "—"}</strong></span>
                </div>
                <div className="actions">
                  <button
                    disabled={busy || detail.revoked || !detail.capabilities?.screenshot}
                    className="primary"
                    onClick={async () => {
                      await act(`/displays/${detail.id}/screenshot`);
                      setNotice("ส่งคำขอถ่ายภาพหน้าจอใหม่แล้ว รอจออัปเดตสักครู่");
                    }}
                  >
                    <RefreshCw size={14} /> ขอภาพใหม่จากจอ
                  </button>
                </div>
              </div>
            </div>
          )}
          {modal === "systemLogs" && (
            <div className="system-logs-modal" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  แสดงรายการล่าสุดจาก <code>data/error.log</code> บนเซิร์ฟเวอร์
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={loadLogs}
                    disabled={busy}
                    style={{ fontSize: "0.85rem", padding: "4px 10px" }}
                  >
                    🔄 รีเฟรช Log
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(systemLogs.join("\n"));
                      setNotice("คัดลอก Log ทั้งหมดลงคลิปบอร์ดแล้ว");
                    }}
                    style={{ fontSize: "0.85rem", padding: "4px 10px" }}
                  >
                    📋 คัดลอก Log
                  </button>
                </div>
              </div>
              <pre
                style={{
                  background: "#0f172a",
                  color: "#e2e8f0",
                  padding: 14,
                  borderRadius: 8,
                  maxHeight: 450,
                  overflowY: "auto",
                  fontSize: "0.8rem",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {systemLogs.length ? systemLogs.join("\n") : "ยังไม่มีข้อมูลบันทึกข้อผิดพลาดในระบบ (ระบบทำงานปกติ)"}
              </pre>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      {preview && (
        <PreviewModal
          items={preview}
          media={media}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
