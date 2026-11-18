import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import {
  Heart,
  CalendarDays,
  MapPin,
  Users,
  LockKeyhole,
  Plus,
  Trash2,
  Pencil,
  Check,
  ChevronDown,
  LogOut,
  Send,
  Instagram,
  Clock,
  ShieldCheck,
  MoreHorizontal,
  Copy,
  Bell,
} from "lucide-react";
import "./style.css";
import { days, regions, sports, periodsForDay, useWishAlerts, WishAlertPanel, WishBoard } from "./wishes";
import { translate } from "./translations";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = url && key ? createClient(url, key) : null;
const defaultGroup = import.meta.env.VITE_RUSH_GROUP_URL || "";
const defaultPayment =
  import.meta.env.VITE_PAYMENT_INSTRUCTIONS ||
  "يرجى التواصل مع إدارة Rush للحصول على بيانات الدفع. الحجز يتأكد بعد الدفع.";
const blankSession = () => ({
  sport: "تنس ريشة",
  venue: "",
  region: "شمال الرياض",
  price: "",
  starts_at: "",
  ends_at: "",
  capacity: 4,
  location_url: "",
});
const Riyal = ({ alt }) => (
  <img
    className="riyal-symbol"
    src={import.meta.env.BASE_URL + "riyal.svg"}
    alt={alt}
  />
);
const validPhone = (p) => /^05\d{8}$/.test(p);
const safeMapUrl = (value) => {
  if (!value || !value.trim()) return "";
  try {
    const u = new URL(value.trim());
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
const isValidUuid = (id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const weekStart = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const date = new Date(
    Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))),
  );
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
};
function IconButton({ children, icon: Icon = Heart, ...props }) {
  return (
    <button {...props} className={"btn " + (props.className || "")}>
      <Icon size={17} />
      {children}
    </button>
  );
}
async function readAllRows(query) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query().range(offset, offset + pageSize - 1);
    if (error) return { error };
    rows.push(...data);
    if (data.length < pageSize) return { data: rows };
  }
}

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem("rush-language") === "en" ? "en" : "ar");
  const t = (text) => translate(language, text);
  const noticeTimer = useRef(null);
  const locale = language === "ar" ? "ar-SA" : "en-GB";
  const fmt = (date) => new Intl.DateTimeFormat(locale, {
    weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh",
  }).format(new Date(date));
  const hour = (date) => new Intl.DateTimeFormat(locale, {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh",
  }).format(new Date(date));
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.title = t("RUSH | قيمك الجاي");
    localStorage.setItem("rush-language", language);
  }, [language]);

  const adminPath =
    decodeURIComponent(location.pathname)
      .replace(/\/$/, "")
      .endsWith("/ادارة") ||
    location.pathname.replace(/\/$/, "").endsWith("/admin");
  const [showAlerts, setShowAlerts] = useState(false);
  const wishAlerts = useWishAlerts(db, !adminPath);
  const alertCount = new Set(wishAlerts.alerts.flatMap((alert) => alert.session_ids)).size;
  const [settings, setSettings] = useState({
      group_url: defaultGroup,
      payment_instructions: defaultPayment,
      payment_instructions_en: "",
    }),
    [tab, setTab] = useState("sessions"),
    [sessions, setSessions] = useState([]),
    [counts, setCounts] = useState({}),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(null),
    [auth, setAuth] = useState(null),
    [pw, setPw] = useState(""),
    [adminTab, setAdminTab] = useState("sessions"),
    [wishes, setWishes] = useState([]),
    [registrations, setRegistrations] = useState([]),
    [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false);
  const [openWishMenu, setOpenWishMenu] = useState(null),
    [editingWish, setEditingWish] = useState(null),
    [editingArchive, setEditingArchive] = useState(null),
    [editingRegistration, setEditingRegistration] = useState(null),
    [selectedWishIds, setSelectedWishIds] = useState([]),
    [archivedWishes, setArchivedWishes] = useState([]),
    [wishView, setWishView] = useState("active"),
    [wishActionBusy, setWishActionBusy] = useState(false);
  const [person, setPerson] = useState({ name: "", phone: "" });
  const [sessionForm, setSessionForm] = useState(blankSession);
  const [wishSportFilter, setWishSportFilter] = useState([]),
    [wishDayFilter, setWishDayFilter] = useState([]),
    [wishRegionFilter, setWishRegionFilter] = useState([]);
  async function loadSettings() {
    if (!db) return;
    const { data, error } = await db
      .from("public_site_settings")
      .select("group_url,payment_instructions,payment_instructions_en")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) {
      setSettings({
        group_url: data.group_url || "",
        payment_instructions: data.payment_instructions || "",
        payment_instructions_en: data.payment_instructions_en || "",
      });
    }
  }
  async function load() {
    if (!db) {
      setSessions([]);
      return;
    }
    const { data, error } = await db
      .from("public_sessions")
      .select("*")
      .order("starts_at");
    if (error) {
      console.error("Rush load sessions:", error);
      setSessions([]);
      flash("تعذر تحميل المواعيد من قاعدة البيانات.");
    } else setSessions(data || []);
    const { data: ct, error: countError } = await db
      .from("session_counts")
      .select("*");
    if (countError) console.error("Rush session counts:", countError);
    else
      setCounts(
        Object.fromEntries(
          (ct || []).map((x) => [x.session_id, x.registered_count]),
        ),
      );
    return data || [];
  }
  async function loadAdmin() {
    if (!db) return;
    const [w, r, st, a] = await Promise.all([
      readAllRows(() => db
        .from("preferences")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")),
      db
        .from("registrations")
        .select("*")
        .order("created_at", { ascending: false }),
      db
        .from("site_settings")
        .select("group_url,payment_instructions,payment_instructions_en")
        .eq("id", 1)
        .maybeSingle(),
      readAllRows(() => db
        .from("archived_preferences")
        .select("*")
        .order("archived_at", { ascending: false })
        .order("id")),
    ]);
    if (st.data) {
      setSettings({
        group_url: st.data.group_url || "",
        payment_instructions: st.data.payment_instructions || "",
        payment_instructions_en: st.data.payment_instructions_en || "",
      });
    }
    if (w.data && a.data) {
      const start = weekStart();
      setWishes(w.data.filter((row) => !row.archived_at && row.week_start >= start));
      setArchivedWishes([
        ...w.data.filter((row) => row.archived_at || row.week_start < start),
        ...a.data,
      ]);
    } else {
      console.error("Rush wishes read error", w.error || a.error);
      flash("تعذر تحميل الرغبات.");
    }
    if (r.data) setRegistrations(r.data);
    load();
  }
  useEffect(() => {
    load();
    loadSettings();
    if (db) db.auth.getSession().then(({ data }) => setAuth(data.session));
    if (db) {
      const {
        data: { subscription },
      } = db.auth.onAuthStateChange((_, s) => setAuth(s));
      return () => subscription.unsubscribe();
    }
  }, []);
  useEffect(() => {
    if (auth && adminPath) loadAdmin();
  }, [auth]);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const nodes = document.querySelectorAll(".reveal:not(.is-visible)");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -35px 0px" },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [tab, adminPath, sessions.length]);
  const flash = (t) => {
    setNotice(t);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4500);
  };
  const toggle = (v, set, x) =>
    set(v.includes(x) ? v.filter((a) => a !== x) : [...v, x]);
  const resetPerson = () => setPerson({ name: "", phone: "" });
  async function toggleWishAlert(wish, subscribe) {
    const saved = await wishAlerts.toggleAlert(wish, subscribe);
    flash(saved
      ? (subscribe ? t("تم تفعيل تنبيه الرغبة داخل الموقع.") : t("تم إيقاف التنبيه."))
      : t("تعذر تحديث التنبيه. جربي مرة ثانية."));
    return saved;
  }
  async function openMatchingSession(id) {
    setShowAlerts(false);
    setTab("sessions");
    const available = await load();
    if (!available?.some((s) => s.id === id)) {
      return flash("الموعد انتهى أو لم يعد متاحًا.");
    }
    requestAnimationFrame(() => document.getElementById("session-" + id)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
  async function joinSession(e) {
    e.preventDefault();
    if (!validPhone(person.phone) || !person.name.trim())
      return flash("تأكدي من الاسم ورقم الجوال");
    if (!db) return flash("الموقع غير متصل بقاعدة البيانات");
    if (!modal?.id || !isValidUuid(modal.id))
      return flash("هذا الموعد غير صالح. افتحي المواعيد من جديد وجربي.");
    setBusy(true);
    const { error } = await db.rpc("join_session", {
      p_session_id: modal.id,
      p_name: person.name.trim(),
      p_phone: person.phone,
    });
    setBusy(false);
    if (error) {
      console.error("Rush join session:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        sessionId: modal.id,
      });
      const msg = (error.message || "").toLowerCase();
      if (error.code === "23505" || msg.includes("duplicate"))
        return flash("سبق سجلتي بهذا الرقم في نفس الموعد");
      if (msg.includes("session full")) return flash("اكتمل العدد لهذا الموعد");
      if (msg.includes("session unavailable")) {
        load();
        return flash("الموعد انتهى أو لم يعد متاحًا.");
      }
      if (msg.includes("invalid details"))
        return flash("تأكدي من الاسم ورقم الجوال");
      if (
        error.code === "PGRST202" ||
        msg.includes("could not find the function")
      )
        return flash("دالة تسجيل المواعيد غير موجودة في Supabase.");
      if (error.code === "22P02")
        return flash("معرّف الموعد غير صالح. افتحي قائمة المواعيد من جديد.");
      if (error.code === "42501")
        return flash("صلاحيات تسجيل المواعيد غير مفعّلة في قاعدة البيانات.");
      return flash(
        t("تعذر التسجيل: ") + (error.message || error.code || t("خطأ غير معروف")),
      );
    }
    setModal({ ...modal, done: true });
    load();
  }
  async function login(e) {
    e.preventDefault();
    if (!db) return flash("اربطي Supabase أولًا لتفعيل الإدارة");
    setBusy(true);
    const { error } = await db.auth.signInWithPassword({
      email: import.meta.env.VITE_ADMIN_EMAIL,
      password: pw,
    });
    setBusy(false);
    if (error) {
      console.error("Rush admin login:", error.message);
      flash(
        error.message?.toLowerCase().includes("invalid login")
          ? t("البريد أو كلمة المرور غير صحيحة")
          : error.message?.toLowerCase().includes("email not confirmed")
            ? t("البريد غير مؤكد في Supabase")
            : t("تعذر تسجيل الدخول: ") + error.message,
      );
    } else setPw("");
  }
  async function saveSettings(e) {
    e.preventDefault();
    if (!db) return flash("اربطي Supabase أولًا");
    if (!auth) return flash("يلزم تسجيل دخول الإدارة");
    let link = settings.group_url.trim();
    if (link) {
      try {
        const u = new URL(link);
        if (!["https:", "http:"].includes(u.protocol)) throw Error();
      } catch {
        return flash("رابط المجموعة غير صحيح");
      }
    }
    setBusy(true);
    const { error } = await db.from("site_settings").upsert({
      id: 1,
      group_url: link,
      payment_instructions: settings.payment_instructions.trim(),
      payment_instructions_en: settings.payment_instructions_en.trim(),
    });
    setBusy(false);
    if (error)
      return flash("تعذر حفظ الإعدادات. تأكدي من تشغيل تحديث قاعدة البيانات.");
    flash("تم حفظ الإعدادات");
    loadSettings();
  }
  async function saveSession(e) {
    e.preventDefault();
    if (!db) return flash("اربطي Supabase أولًا");
    const verifiedLocation = safeMapUrl(sessionForm.location_url);
    if (verifiedLocation === null) return flash("تأكدي أن رابط الموقع يبدأ بـ https:// أو http://");
    if (
      sessionForm.price === "" ||
      Number(sessionForm.price) < 0 ||
      !Number.isFinite(Number(sessionForm.price))
    )
      return flash("حددي سعر الموعد");
    if (new Date(sessionForm.ends_at + "+03:00") <= new Date(sessionForm.starts_at + "+03:00"))
      return flash("تأكدي أن نهاية الموعد بعد بدايته");
    setBusy(true);
    const payload = {
      ...sessionForm,
      location_url: verifiedLocation || null,
      price: Number(sessionForm.price),
      capacity: Number(sessionForm.capacity),
      starts_at: new Date(sessionForm.starts_at + "+03:00").toISOString(),
      ends_at: new Date(sessionForm.ends_at + "+03:00").toISOString(),
    };
    const { error } = edit
      ? await db.from("sessions").update(payload).eq("id", edit)
      : await db.from("sessions").insert(payload);
    setBusy(false);
    if (error) return flash("تعذر حفظ الموعد");
    setEdit(null);
    setSessionForm(blankSession());
    loadAdmin();
    flash("تم حفظ الموعد");
  }
  async function saveEditedWish(e) {
    e.preventDefault();
    if (!editingWish || !db) return;
    const w = editingWish;
    if (!w.name.trim() || !validPhone(w.phone) || !w.regions?.length)
      return flash("كملي البيانات والمناطق");
    setBusy(true);
    const { error } = await db.rpc("update_preference", {
      p_id: w.id,
      p_name: w.name.trim(),
      p_phone: w.phone,
      p_sport: w.sport,
      p_day: w.day,
      p_period: w.period,
      p_regions: w.regions,
    });
    setBusy(false);
    if (error) {
      console.error("Rush edit wish", error);
      return flash(
        error.code === "23505"
          ? t("هذه الرغبة مسجلة بالفعل لنفس الرقم")
          : t("تعذر تعديل الرغبة. شغلي تحديث Supabase."),
      );
    }
    setEditingWish(null);
    setWishes((prev) => prev.map((x) => (x.id === w.id ? { ...x, ...w } : x)));
    flash("تم تعديل الرغبة");
  }
  async function manageSelectedWishes(action) {
    if (!db || !selectedWishIds.length) return;
    const ids = [...selectedWishIds];
    const prompt = t(action === "archive"
      ? t("أرشفة الرغبات المحددة ({count})؟")
      : t("حذف الرغبات المحددة نهائيًا ({count})؟"));
    if (!window.confirm(prompt.replace("{count}", ids.length))) return;
    setWishActionBusy(true);
    const { data, error } = await db.rpc("manage_preferences", {
      p_ids: ids,
      p_action: action,
    });
    setWishActionBusy(false);
    if (error) {
      console.error("Rush manage preferences RPC error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      const message =
        error.code === "42501"
          ? t("صلاحية الإدارة غير مفعّلة على بريدك في Supabase. راجعي دالة is_admin.")
          : error.code === "PGRST202" || error.code === "42883"
            ? t("الدالة manage_preferences غير موجودة في قاعدة البيانات المرتبطة بالموقع.")
            : t("فشل الإجراء: ") + error.message;
      return flash(message);
    }
    setWishes((prev) => prev.filter((w) => !ids.includes(w.id)));
    setSelectedWishIds([]);
    if (action === "archive") {
      setWishView("archived");
      await loadAdmin();
    }
    const message = t(action === "archive" ? t("تمت أرشفة الرغبات ({count}).") : t("تم حذف الرغبات ({count})."));
    flash(message.replace("{count}", typeof data === "number" ? data : ids.length));
  }
  async function deleteWish(id) {
    setOpenWishMenu(null);
    if (!window.confirm(t("حذف هذه الرغبة نهائيًا؟"))) return;
    const { error } = await db.rpc("manage_preferences", {
      p_ids: [id],
      p_action: "delete",
    });
    if (error) {
      console.error("Rush delete wish error", error);
      return flash(t("تعذر حذف الرغبة: ") + error.message);
    }
    setWishes((prev) => prev.filter((w) => w.id !== id));
    setSelectedWishIds((prev) => prev.filter((x) => x !== id));
    flash("تم حذف الرغبة");
  }
  const toggleWishSelection = (id) =>
    setSelectedWishIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const selectFilteredWishes = () => {
    const ids = groupedWishes.flatMap((g) => g.players.map((w) => w.id));
    setSelectedWishIds((prev) =>
      ids.every((id) => prev.includes(id))
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])],
    );
  };
  async function saveArchiveEdit(e) {
    e.preventDefault();
    if (!db || !editingArchive) return;
    const w = editingArchive;
    if (!validPhone(w.phone)) return flash("رقم الجوال غير صحيح");
    setBusy(true);
    const { error } = await db.rpc(w.source_preference_id ? "edit_archived_preference" : "update_preference", {
      ...(!w.source_preference_id && { p_name: w.name }),
      p_id: w.id,
      p_phone: w.phone,
      p_sport: w.sport,
      p_day: w.day,
      p_period: w.period,
      p_regions: w.regions || [],
    });
    setBusy(false);
    if (error) {
      console.error("Rush archive edit", error);
      return flash(t("تعذر تعديل سجل المنتهية: ") + error.message);
    }
    setArchivedWishes((prev) =>
      prev.map((x) => (x.id === w.id ? { ...x, ...w } : x)),
    );
    setEditingArchive(null);
    flash("تم تعديل السجل");
  }
  async function removeArchiveItem(wish) {
    if (!window.confirm(t("حذف هذه الرغبة من سجل المنتهية نهائيًا؟"))) return;
    setBusy(true);
    const { error } = wish.source_preference_id
      ? await db.rpc("delete_archived_preference", { p_id: wish.id })
      : await db.rpc("manage_preferences", { p_ids: [wish.id], p_action: "delete" });
    setBusy(false);
    if (error) {
      console.error("Rush archive delete", error);
      return flash(t("تعذر حذف السجل: ") + error.message);
    }
    setArchivedWishes((prev) => prev.filter((w) => w.id !== wish.id));
    flash("تم حذف السجل");
  }
  async function saveRegistrationEdit(e) {
    e.preventDefault();
    if (!db || !editingRegistration) return;
    const w = editingRegistration;
    if (!w.name.trim() || !validPhone(w.phone))
      return flash("تأكدي من الاسم ورقم الجوال");
    setBusy(true);
    const { error } = await db.rpc("edit_session_registration", {
      p_id: w.id,
      p_name: w.name.trim(),
      p_phone: w.phone,
    });
    setBusy(false);
    if (error) {
      console.error("Rush registration edit", error);
      return flash(
        error.code === "23505"
          ? t("الرقم مسجل في هذا الموعد بالفعل")
          : t("تعذر تعديل تسجيل اللاعبة: ") + error.message,
      );
    }
    setRegistrations((prev) =>
      prev.map((x) =>
        x.id === w.id ? { ...x, name: w.name.trim(), phone: w.phone } : x,
      ),
    );
    setEditingRegistration(null);
    flash("تم تعديل تسجيل اللاعبة");
  }
  async function cancelRegistration(id) {
    if (
      !window.confirm(
        t("إلغاء تسجيل هذه اللاعبة من الموعد؟ سيتوفر مقعد بدلًا عنها."),
      )
    )
      return;
    setBusy(true);
    const { error } = await db.rpc("cancel_session_registration", { p_id: id });
    setBusy(false);
    if (error) {
      console.error("Rush registration cancel", error);
      return flash(t("تعذر إلغاء تسجيل اللاعبة: ") + error.message);
    }
    setRegistrations((prev) => prev.filter((x) => x.id !== id));
    await load();
    flash("تم إلغاء التسجيل وتحرير المقعد");
  }
  async function deleteSession(id) {
    if (!confirm(t("حذف هذا الموعد وجميع طلبات الانضمام له؟"))) return;
    const { error } = await db.from("sessions").delete().eq("id", id);
    if (error) flash("تعذر حذف الموعد");
    else {
      loadAdmin();
      flash("تم حذف الموعد");
    }
  }
  const groupedWishes = Object.values(
    wishes
      .filter(
        (w) =>
          (!wishSportFilter.length || wishSportFilter.includes(w.sport)) &&
          (!wishDayFilter.length || wishDayFilter.includes(w.day)) &&
          (!wishRegionFilter.length ||
            (Array.isArray(w.regions) && w.regions.some((r) => wishRegionFilter.includes(r)))),
      )
      .reduce((acc, w) => {
        const key = [w.week_start, w.sport, w.day, w.period].join("|");
        if (!acc[key])
          acc[key] = {
            key,
            sport: w.sport,
            day: w.day,
            period: w.period,
            week_start: w.week_start,
            players: [],
          };
        acc[key].players.push(w);
        return acc;
      }, {}),
  )
    .map((g) => ({
      ...g,
      players: g.players.filter(
        (w, i, arr) => arr.findIndex((x) => x.phone === w.phone) === i,
      ),
      count: new Set(g.players.map((w) => w.phone)).size,
    }))
    .sort(
      (a, b) => b.count - a.count || days.indexOf(a.day) - days.indexOf(b.day),
    );
  const phoneHistory = Object.values(
    archivedWishes.reduce((acc, w) => {
      const p = w.phone;
      if (!acc[p])
        acc[p] = {
          phone: p,
          entries: [],
          sports: new Map(),
          regions: new Map(),
        };
      const x = acc[p];
      x.entries.push(w);
      x.sports.set(w.sport, (x.sports.get(w.sport) || 0) + 1);
      for (const r of w.regions || [])
        x.regions.set(r, (x.regions.get(r) || 0) + 1);
      return acc;
    }, {}),
  ).sort((a, b) => b.entries.length - a.entries.length);
  const dateLocal = (value) =>
    new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const repeatSession = (session) => {
    setEdit(null);
    setSessionForm({
      sport: session.sport,
      venue: session.venue,
      region: session.region || "شمال الرياض",
      price: session.price ?? 0,
      capacity: session.capacity,
      location_url: session.location_url || "",
      starts_at: "",
      ends_at: "",
    });
    flash("تم نسخ تفاصيل الموعد. حددي تاريخ ووقت الموعد الجديد ثم احفظيه.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="site">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <main className="shell">
        <header className="topbar">
          <a className="logo" href={import.meta.env.BASE_URL} aria-label="Rush">
            <img
              src={import.meta.env.BASE_URL + "rush-logo-dark.svg"}
              alt={t("شعار Rush")}
            />
          </a>
          {!adminPath && (
            <div className="public-nav-wrap">
              <nav>
                <button
                  className={tab === "wishes" ? "selected" : ""}
                  onClick={() => setTab("wishes")}
                >
                  {t("الرغبات")}
                </button>
                <button
                  className={tab === "sessions" ? "selected" : ""}
                  onClick={() => setTab("sessions")}
                >
                  {t("المواعيد")}
                </button>
              </nav>
            </div>
          )}
          <div className="header-tools">
            {!adminPath && (
              <button type="button" className="btn wish-bell" aria-expanded={showAlerts}
                aria-controls={showAlerts ? "wish-alerts" : undefined}
                aria-label={alertCount ? t("تنبيهات الرغبات") + " (" + alertCount + ")" : t("تنبيهات الرغبات")}
                onClick={() => { setShowAlerts(!showAlerts); if (!showAlerts) load(); }}>
                <Bell size={18} />
                {alertCount > 0 && <span className="seat-pill wish-bell-count">{alertCount}</span>}
              </button>
            )}
            <button type="button" className="btn language-toggle" lang={language === "ar" ? "en" : "ar"}
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}>
              {language === "ar" ? "EN" : "عربي"}
            </button>
            {adminPath && (
              <button
                type="button"
                className="admin-label admin-logout"
                onClick={async () => {
                  if (db && auth) {
                    await db.auth.signOut();
                    setAuth(null);
                  } else {
                    flash("سجلي الدخول أولًا");
                  }
                }}
                title={t("تسجيل الخروج")}
              >
                <LogOut size={17} />{" "}{t("الإدارة")}
              </button>
            )}
          </div>
        </header>
        {!adminPath && showAlerts && (
          <WishAlertPanel {...wishAlerts} onToggle={toggleWishAlert} onSession={openMatchingSession}
            sessions={sessions} t={t} />
        )}
        {!adminPath ? (
          <>
            <section className="hero reveal">
              <h1>
                {t("قيمك الجاي")}
                <br />
                <em>{t("مع Rush.")}</em>
              </h1>
            </section>
            <section className="content">
              <div className="section-heading reveal">
                <div>
                  <span className="eyebrow">
                    {tab === "wishes" ? t("رغبات الأسبوع") : t("المواعيد المتاحة")}
                  </span>
                  <h2>
                    {tab === "wishes" ? t("وش ودك تلعبين؟") : t("القيمات الجاية")}
                  </h2>
                  <p className="wish-help-text">
                    {tab === "wishes"
                      ? t("صوّتي على رغبة موجودة أو أضيفي رغبتك للأسبوع. التصويت يساعدنا نختار المواعيد الجاية.")
                      : t("ما لقيتي موعد يناسبك؟ سجّلي رغباتك عشان تساعدينا نعرف الرياضة والوقت والمنطقة المناسبة لك في المواعيد الجاية.")}
                  </p>
                </div>
              </div>
              {tab === "wishes" ? (
                <WishBoard db={db} {...wishAlerts} onToggle={toggleWishAlert} t={t} flash={flash} />
              ) : (
                <div className="session-grid">
                  {sessions.length ? (
                    sessions.map((s) => {
                      let count = counts[s.id] ?? s.count ?? 0;
                      return (
                        <article className="session-card reveal" key={s.id} id={"session-" + s.id}>
                          <div className="session-top">
                            <span className="session-sport">
                              {s.sport === "تنس ريشة" ? "🏸" : "🎾"} {t(s.sport)}
                            </span>
                            <span className="seat-pill">
                              <Users size={14} />
                              {t("متبقي")}{" "}{Math.max(0, Number(s.capacity) - Number(count))}
                            </span>
                          </div>
                          <div className="session-main">
                            <h3>{s.venue}</h3>
                            <div className="session-info">
                              <span>
                                <CalendarDays size={16} />
                                {fmt(s.starts_at)}
                              </span>
                              <span>
                                <Clock size={16} />
                                {hour(s.starts_at)} – {hour(s.ends_at)}
                              </span>
                              <span>
                                <MapPin size={16} />
                                {t(s.region || "الرياض")}
                              </span>
                              {safeMapUrl(s.location_url) && (
                                <a className="session-map-link" href={safeMapUrl(s.location_url)} target="_blank" rel="noopener noreferrer">
                                  <MapPin size={15} />{" "}{t("موقع الملعب على الخريطة")}
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="session-bottom">
                            <span className="price-pill">
                              <Riyal alt={t("ريال سعودي")} />
                              <b>
                                {Number(s.price || 0).toLocaleString(locale)}
                              </b>
                            </span>
                          </div>
                          <IconButton
                            icon={Heart}
                            className="primary full"
                            disabled={count >= s.capacity}
                            onClick={() => {
                              resetPerson();
                              setModal(s);
                            }}
                          >
                            {count >= s.capacity ? t("اكتمل العدد") : t("أبغى ألعب")}
                          </IconButton>
                        </article>
                      );
                    })
                  ) : (
                    <div className="empty">{t("ما فيه مواعيد معلنة حاليًا ♡")}</div>
                  )}
                </div>
              )}
            </section>
            <footer className="reveal">
              <div className="footer-main">
                <div className="footer-brand">
                  <div className="footer-logo">
                    <img
                      src={import.meta.env.BASE_URL + "rush-logo-white.svg"}
                      alt={t("شعار Rush")}
                    />
                  </div>
                  <div>
                    <strong>rush</strong>
                    <p>
                      {t("مجتمع رياضي للبنات في الرياض، يجمعنا حب اللعب والتجارب الجديدة.")}
                      <br />
                      {t("اختاري رياضتك ووقتك، وخلي قيمك الجاي معنا!")}
                    </p>
                  </div>
                </div>
                {settings.group_url ? (
                  <a
                    className="btn footer-btn"
                    href={settings.group_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Users className="group-join-icon" size={18} />{" "}{t("انضمي للمجموعة")}
                  </a>
                ) : (
                  <span className="footer-placeholder">
                    <Users size={17} />{" "}{t("رابط المجموعة قريبًا")}
                  </span>
                )}
              </div>
              <div className="copyright">© {new Date().getFullYear()} RUSH</div>
            </footer>
          </>
        ) : !auth ? (
          <section className="admin-login panel">
            <LockKeyhole size={30} />
            <h2>{t("إدارة Rush")}</h2>
            <p>{t("أدخلي كلمة المرور للمتابعة")}</p>
            <form onSubmit={login}>
              <input
                type="password"
                placeholder={t("كلمة المرور")}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
              <IconButton
                icon={LockKeyhole}
                className="primary full"
                disabled={busy}
              >
                {t("دخول")}
              </IconButton>
            </form>
          </section>
        ) : (
          <section className="admin-content">
            <div className="admin-tabs">
              <button
                className={adminTab === "sessions" ? "selected" : ""}
                onClick={() => setAdminTab("sessions")}
              >
                {t("المواعيد")}
              </button>
              <button
                className={adminTab === "wishes" ? "selected" : ""}
                onClick={() => setAdminTab("wishes")}
              >
                {t("الرغبات")}
              </button>
              <button
                className={adminTab === "settings" ? "selected" : ""}
                onClick={() => setAdminTab("settings")}
              >
                {t("الإعدادات")}
              </button>
            </div>
            {adminTab === "settings" ? (
              <form
                className="panel admin-form settings-form"
                onSubmit={saveSettings}
              >
                <h3>{t("إعدادات Rush")}</h3>
                <label>
                  {t("تعليمات الدفع")}
                  <textarea
                    rows="5"
                    value={settings.payment_instructions}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        payment_instructions: e.target.value,
                      })
                    }
                    placeholder={t("اكتبي تعليمات الدفع التي تظهر بعد التسجيل")}
                  />
                </label>
                <label>
                  {t("تعليمات الدفع بالإنجليزي (اختياري)")}
                  <textarea
                    dir="ltr"
                    value={settings.payment_instructions_en}
                    onChange={(e) => setSettings({ ...settings, payment_instructions_en: e.target.value })}
                  />
                </label>
                <label>
                  {t("رابط مجموعة Rush")}
                  <input
                    type="url"
                    dir="ltr"
                    placeholder="https://chat.whatsapp.com/..."
                    value={settings.group_url}
                    onChange={(e) =>
                      setSettings({ ...settings, group_url: e.target.value })
                    }
                  />
                </label>
                <IconButton icon={Check} className="primary" disabled={busy}>
                  {t("حفظ الإعدادات")}
                </IconButton>
              </form>
            ) : adminTab === "sessions" ? (
              <>
                <form className="panel admin-form" onSubmit={saveSession}>
                  <h3>{edit ? t("تعديل موعد") : t("إضافة موعد")}</h3>
                  <div className="fields">
                    <label>
                      {t("الرياضة")}
                      <select
                        value={sessionForm.sport}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            sport: e.target.value,
                          })
                        }
                      >
                        {sports.map((s) => (
                          <option key={s} value={s}>{t(s)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("المكان")}
                      <input
                        required
                        value={sessionForm.venue}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            venue: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t("المنطقة")}
                      <select
                        value={sessionForm.region}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            region: e.target.value,
                          })
                        }
                      >
                        {regions.map((r) => (
                          <option key={r} value={r}>
                            {t(r)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("رابط موقع الملعب (اختياري)")}
                      <input
                        type="url"
                        dir="ltr"
                        placeholder="https://maps.app.goo.gl/..."
                        value={sessionForm.location_url || ""}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            location_url: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t("سعر اللاعبة (ريال)")}
                      <input
                        required
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder={t("مثال: 50")}
                        value={sessionForm.price}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            price: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t("البداية")}
                      <input
                        required
                        type="datetime-local"
                        value={sessionForm.starts_at}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            starts_at: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t("النهاية")}
                      <input
                        required
                        type="datetime-local"
                        value={sessionForm.ends_at}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            ends_at: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t("عدد المقاعد")}
                      <input
                        type="number"
                        min="1"
                        required
                        value={sessionForm.capacity}
                        onChange={(e) =>
                          setSessionForm({
                            ...sessionForm,
                            capacity: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <IconButton icon={edit ? Check : Plus} className="primary">
                    {edit ? t("حفظ التعديل") : t("إضافة الموعد")}
                  </IconButton>
                  {edit && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEdit(null);
                        setSessionForm(blankSession());
                      }}
                    >
                      {t("إلغاء التعديل")}
                    </button>
                  )}
                </form>
                {sessions.map((s) => (
                  <div className="admin-item panel" key={s.id}>
                    <div className="admin-item-head">
                      <div>
                        <strong>
                          {t(s.sport)} · {s.venue}
                        </strong>
                        <p>
                          {fmt(s.starts_at)} · {hour(s.starts_at)} ·{" "}
                          {t("متبقي")}{" "}{Math.max(0, Number(s.capacity) - Number(counts[s.id] ?? s.count ?? 0))}
                        </p>
                      </div>
                      <div className="mini-actions">
                        <button
                          type="button"
                          aria-label={t("تكرار الموعد")}
                          title={t("تكرار الموعد")}
                          onClick={() => repeatSession(s)}
                        >
                          <Copy size={17} />
                        </button>
                        <button
                          aria-label={t("تعديل")}
                          onClick={() => {
                            setEdit(s.id);
                            setSessionForm({
                              sport: s.sport,
                              venue: s.venue,
                              starts_at: dateLocal(s.starts_at),
                              ends_at: dateLocal(s.ends_at),
                              capacity: s.capacity,
                              region: s.region || "شمال الرياض",
                              price: s.price ?? 0,
                              location_url: s.location_url || "",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          aria-label={t("حذف")}
                          onClick={() => deleteSession(s.id)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="names registration-list">
                      {registrations
                        .filter((r) => r.session_id === s.id)
                        .map((r) => (
                          <div key={r.id} className="registration-row">
                            <span className="registration-player">
                              <strong>{r.name}</strong>
                              <span dir="ltr">{r.phone}</span>
                            </span>
                            <span className="registration-actions">
                              <button
                                type="button"
                                aria-label={t("تعديل تسجيل ") + r.name}
                                title={t("تعديل اللاعبة")}
                                onClick={() => setEditingRegistration({ ...r })}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                className="danger-action"
                                title={t("إلغاء التسجيل")}
                                aria-label={t("إلغاء تسجيل ") + r.name}
                                disabled={busy}
                                onClick={() => cancelRegistration(r.id)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="wish-overview">
                <div className="wish-subtabs">
                  <button
                    type="button"
                    className={wishView === "active" ? "selected" : ""}
                    onClick={() => setWishView("active")}
                  >
                    {t("الرغبات الحالية")}
                  </button>
                  <button
                    type="button"
                    className={wishView === "archived" ? "selected" : ""}
                    onClick={() => setWishView("archived")}
                  >
                    {t("المنتهية (")}{archivedWishes.length})
                  </button>
                </div>
                {wishView === "active" ? (
                  <>
                    <div className="wish-filters panel">
                      {[
                        { label: t("الرياضات"), options: sports, values: wishSportFilter, update: setWishSportFilter },
                        { label: t("الأيام"), options: days, values: wishDayFilter, update: setWishDayFilter },
                        { label: t("المناطق"), options: regions, values: wishRegionFilter, update: setWishRegionFilter }
                      ].map((filter) => (
                        <fieldset className="wish-filter-group" key={filter.label}>
                          <legend>{filter.label}</legend>
                          <div className="wish-filter-options">
                            {filter.options.map((option) => (
                              <label key={option} className={"wish-filter-option " + (filter.values.includes(option) ? "active" : "")}>
                                <input
                                  type="checkbox"
                                  checked={filter.values.includes(option)}
                                  onChange={() => filter.update((previous) =>
                                    previous.includes(option)
                                      ? previous.filter((x) => x !== option)
                                      : [...previous, option]
                                  )}
                                />
                                {t(option)}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                      {(wishSportFilter.length > 0 || wishDayFilter.length > 0 || wishRegionFilter.length > 0) && (
                        <button type="button" className="clear-wish-filters" onClick={() => {
                          setWishSportFilter([]);
                          setWishDayFilter([]);
                          setWishRegionFilter([]);
                        }}>{t("مسح التصفيات")}</button>
                      )}
                    </div>
                    <div className="wish-controls">
                      <label className="select-all-label">
                        <input
                          type="checkbox"
                          checked={
                            groupedWishes.length > 0 &&
                            groupedWishes.every((g) =>
                              g.players.every((w) =>
                                selectedWishIds.includes(w.id),
                              ),
                            )
                          }
                          onChange={selectFilteredWishes}
                        />{" "}
                        {t("تحديد الظاهر (")}
                        {groupedWishes.reduce(
                          (n, g) => n + g.players.length,
                          0,
                        )}
                        )
                      </label>
                      <span className="wish-total">
                        {groupedWishes.length}{" "}{t("مجموعات · مرتبة حسب العدد")}
                      </span>
                    </div>
                    {selectedWishIds.length > 0 && (
                      <div className="wish-bulk-bar">
                        <strong>{t("تم تحديد")}{" "}{selectedWishIds.length}</strong>
                        <div>
                          <button
                            type="button"
                            disabled={wishActionBusy}
                            onClick={() => manageSelectedWishes("archive")}
                          >
                            <Check size={16} />{" "}{t("نقل للمنتهية")}
                          </button>
                          <button
                            type="button"
                            disabled={wishActionBusy}
                            className="danger"
                            onClick={() => manageSelectedWishes("delete")}
                          >
                            <Trash2 size={16} />{" "}{t("حذف المحدد")}
                          </button>
                          <button
                            type="button"
                            className="clear-selection"
                            onClick={() => setSelectedWishIds([])}
                          >
                            {t("إلغاء التحديد")}
                          </button>
                        </div>
                      </div>
                    )}
                    {groupedWishes.length ? (
                      groupedWishes.map((g) => (
                        <section className="panel wish-group" key={g.key}>
                          <div className="wish-group-head">
                            <div>
                              <h3>{t(g.sport)}</h3>
                              <p>
                                {t(g.day)} · {t(g.period || t("أي وقت"))}
                              </p>
                              <small>{t("أسبوع")}{" "}{g.week_start}</small>
                            </div>
                            <span className="wish-count">
                              <Users size={16} />
                              {g.count}
                            </span>
                          </div>
                          <div className="names">
                            {g.players.map((w) => (
                              <div key={w.id} className="wish-entry">
                                <input
                                  className="wish-checkbox"
                                  type="checkbox"
                                  aria-label={t("تحديد رغبة ") + w.phone}
                                  checked={selectedWishIds.includes(w.id)}
                                  onChange={() => toggleWishSelection(w.id)}
                                />
                                <div className="wish-person">
                                  <strong>{w.name}</strong>
                                  <span dir="ltr">{w.phone}</span>
                                  <small>
                                    {Array.isArray(w.regions) &&
                                    w.regions.length
                                      ? w.regions.map(t).join(" · ")
                                      : t("لم تُحدد مناطق")}
                                  </small>
                                </div>
                                <div className="wish-menu-wrap">
                                  <button
                                    type="button"
                                    className="wish-menu-trigger"
                                    aria-label={t("خيارات رغبة ") + w.name}
                                    aria-expanded={openWishMenu === w.id}
                                    onClick={() =>
                                      setOpenWishMenu(
                                        openWishMenu === w.id ? null : w.id,
                                      )
                                    }
                                  >
                                    <MoreHorizontal size={22} />
                                  </button>
                                  {openWishMenu === w.id && (
                                    <div className="wish-menu">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingWish({
                                            ...w,
                                            regions: [...(w.regions || [])],
                                          });
                                          setOpenWishMenu(null);
                                        }}
                                      >
                                        <Pencil size={16} />{" "}{t("تعديل الرغبة")}
                                      </button>
                                      <button
                                        type="button"
                                        className="danger"
                                        onClick={() => deleteWish(w.id)}
                                      >
                                        <Trash2 size={16} />{" "}{t("حذف الرغبة")}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className="panel wish-empty">
                        {t("ما فيه رغبات مطابقة.")}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="archive-note">
                      {t("تُحفظ هنا رغبات الأسابيع السابقة، مرتبة حسب رقم الجوال.")}
                    </p>
                    {phoneHistory.length ? (
                      phoneHistory.map((p) => (
                        <div key={p.phone} className="panel archive-phone-card">
                          <div className="archive-phone-head">
                            <strong dir="ltr">{p.phone}</strong>
                            <span className="wish-count">
                              {p.entries.length}{" "}{t("رغبات")}
                            </span>
                          </div>
                          <div className="archive-stats">
                            <div>
                              <b>{t("الرياضات")}</b>
                              {[...p.sports]
                                .sort((a, b) => b[1] - a[1])
                                .map(([sport, n]) => (
                                  <span key={sport}>
                                    {t(sport)} · {n}
                                  </span>
                                ))}
                            </div>
                            <div>
                              <b>{t("المناطق المناسبة")}</b>
                              {[...p.regions]
                                .sort((a, b) => b[1] - a[1])
                                .map(([region, n]) => (
                                  <span key={region}>
                                    {t(region)} · {n}
                                  </span>
                                ))}
                            </div>
                          </div>
                          <details>
                            <summary>{t("سجل الرغبات (")}{p.entries.length})</summary>
                            {p.entries.map((w) => (
                              <div className="archive-entry" key={w.id}>
                                <div>
                                  <strong>{t(w.sport)}</strong>
                                  {w.name && <small> · {w.name}</small>}
                                  <p>
                                    {t(w.day)} · {t(w.period || t("أي وقت"))} · {w.week_start}
                                  </p>
                                  <small>
                                    {(w.regions || []).map(t).join(" · ") ||
                                      t("لا توجد مناطق")}
                                  </small>
                                </div>
                                <div className="archive-entry-actions">
                                  <button
                                    type="button"
                                    title={t("تعديل السجل")}
                                    aria-label={t("تعديل سجل الرغبة")}
                                    onClick={() =>
                                      setEditingArchive({
                                        ...w,
                                        regions: [...(w.regions || [])],
                                      })
                                    }
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-action"
                                    title={t("حذف السجل")}
                                    aria-label={t("حذف سجل الرغبة")}
                                    onClick={() => removeArchiveItem(w)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </details>
                        </div>
                      ))
                    ) : (
                      <div className="panel wish-empty">
                        {t("لا توجد رغبات منتهية بعد.")}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </main>
      {editingRegistration && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingRegistration(null);
          }}
        >
          <div className="modal panel manage-modal">
            <button
              type="button"
              className="close"
              aria-label={t("إغلاق")}
              onClick={() => setEditingRegistration(null)}
            >
              ×
            </button>
            <h2>{t("تعديل تسجيل اللاعبة")}</h2>
            <form onSubmit={saveRegistrationEdit}>
              <label>
                {t("الاسم")}
                <input
                  required
                  maxLength={70}
                  value={editingRegistration.name}
                  onChange={(e) =>
                    setEditingRegistration({
                      ...editingRegistration,
                      name: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {t("رقم الجوال")}
                <input
                  required
                  type="tel"
                  dir="ltr"
                  inputMode="numeric"
                  value={editingRegistration.phone}
                  onChange={(e) =>
                    setEditingRegistration({
                      ...editingRegistration,
                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                    })
                  }
                />
              </label>
              <IconButton className="primary full" icon={Check} disabled={busy}>
                {t("حفظ التعديل")}
              </IconButton>
            </form>
          </div>
        </div>
      )}
      {editingArchive && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingArchive(null);
          }}
        >
          <div className="modal panel manage-modal">
            <button
              type="button"
              className="close"
              aria-label={t("إغلاق")}
              onClick={() => setEditingArchive(null)}
            >
              ×
            </button>
            <h2>{t("تعديل سجل الرغبة المنتهية")}</h2>
            <form onSubmit={saveArchiveEdit}>
              <label>
                {t("رقم الجوال")}
                <input
                  required
                  type="tel"
                  dir="ltr"
                  inputMode="numeric"
                  value={editingArchive.phone}
                  onChange={(e) =>
                    setEditingArchive({
                      ...editingArchive,
                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                    })
                  }
                />
              </label>
              <label>
                {t("الرياضة")}
                <select
                  value={editingArchive.sport}
                  onChange={(e) =>
                    setEditingArchive({
                      ...editingArchive,
                      sport: e.target.value,
                    })
                  }
                >
                  {sports.map((v) => (
                    <option key={v} value={v}>
                      {t(v || t("أي وقت"))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("اليوم")}
                <select
                  value={editingArchive.day}
                  onChange={(e) =>
                    setEditingArchive({
                      ...editingArchive,
                      day: e.target.value,
                      period: "",
                    })
                  }
                >
                  {days.map((v) => (
                    <option key={v} value={v}>
                      {t(v || t("أي وقت"))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("الفترة")}
                <select
                  value={editingArchive.period}
                  onChange={(e) =>
                    setEditingArchive({
                      ...editingArchive,
                      period: e.target.value,
                    })
                  }
                >
                  {["", ...periodsForDay(editingArchive.day)].map((v) => (
                    <option key={v} value={v}>
                      {t(v || t("أي وقت"))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="edit-regions">
                <span>{t("المناطق المناسبة")}</span>
                <div className="chips">
                  {regions.map((v) => (
                    <button
                      type="button"
                      key={v}
                      className={
                        "chip " +
                        (editingArchive.regions.includes(v) ? "active" : "")
                      }
                      onClick={() =>
                        setEditingArchive({
                          ...editingArchive,
                          regions: editingArchive.regions.includes(v)
                            ? editingArchive.regions.filter((x) => x !== v)
                            : [...editingArchive.regions, v],
                        })
                      }
                    >
                      {t(v)}
                    </button>
                  ))}
                </div>
              </div>
              <IconButton className="primary full" icon={Check} disabled={busy}>
                {t("حفظ التعديل")}
              </IconButton>
            </form>
          </div>
        </div>
      )}
      {editingWish && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingWish(null);
          }}
        >
          <div className="modal panel wish-edit-modal">
            <button
              type="button"
              className="close"
              onClick={() => setEditingWish(null)}
              aria-label={t("إغلاق")}
            >
              ×
            </button>
            <h2>{t("تعديل الرغبة")}</h2>
            <form onSubmit={saveEditedWish}>
              <label>
                {t("الاسم")}
                <input
                  required
                  maxLength={70}
                  value={editingWish.name}
                  onChange={(e) =>
                    setEditingWish({ ...editingWish, name: e.target.value })
                  }
                />
              </label>
              <label>
                {t("رقم الجوال")}
                <input
                  required
                  dir="ltr"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={editingWish.phone}
                  onChange={(e) =>
                    setEditingWish({
                      ...editingWish,
                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                    })
                  }
                />
              </label>
              <label>
                {t("الرياضة")}
                <select
                  value={editingWish.sport}
                  onChange={(e) =>
                    setEditingWish({ ...editingWish, sport: e.target.value })
                  }
                >
                  {sports.map((x) => (
                    <option key={x} value={x}>
                      {t(x || t("أي وقت"))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("اليوم")}
                <select
                  value={editingWish.day}
                  onChange={(e) =>
                    setEditingWish({ ...editingWish, day: e.target.value })
                  }
                >
                  {days.map((x) => (
                    <option key={x} value={x}>
                      {t(x || t("أي وقت"))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("الفترة")}
                <select
                  value={editingWish.period}
                  onChange={(e) =>
                    setEditingWish({ ...editingWish, period: e.target.value })
                  }
                >
                  {["", ...periodsForDay(editingWish.day)].map((x) => (
                    <option key={x} value={x}>
                      {t(x || t("أي وقت"))}
                    </option>
                  ))}
                </select>
              </label>
              <div className="edit-regions">
                <span>{t("المناطق المناسبة")}</span>
                <div className="chips">
                  {regions.map((x) => (
                    <button
                      key={x}
                      type="button"
                      className={
                        "chip " +
                        (editingWish.regions?.includes(x) ? "active" : "")
                      }
                      onClick={() =>
                        setEditingWish({
                          ...editingWish,
                          regions: editingWish.regions?.includes(x)
                            ? editingWish.regions.filter((y) => y !== x)
                            : [...(editingWish.regions || []), x],
                        })
                      }
                    >
                      {t(x)}
                    </button>
                  ))}
                </div>
              </div>
              <IconButton icon={Check} className="primary full" disabled={busy}>
                {t("حفظ التعديل")}
              </IconButton>
            </form>
          </div>
        </div>
      )}
      {notice && <div className="toast" role="status">{t(notice)}</div>}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="modal panel">
            <button className="close" aria-label={t("إغلاق")} onClick={() => setModal(null)}>
              ×
            </button>
            {modal.done ? (
              <>
                <div className="success-icon">
                  <Check size={26} />
                </div>
                <h2>{t("وصلنا طلبك ♡")}</h2>
                <p>{t("تعليمات الدفع")}</p>
                <div className="payment-note">
                  {language === "en"
                    ? settings.payment_instructions_en || t(settings.payment_instructions)
                    : settings.payment_instructions}
                </div>
                <IconButton
                  icon={Check}
                  className="primary full"
                  onClick={() => setModal(null)}
                >
                  {t("تمام")}
                </IconButton>
              </>
            ) : (
              <>
                <span className="eyebrow">{t("الانضمام للقيم")}</span>
                <h2>{t(modal.sport)}</h2>
                <p>
                  {fmt(modal.starts_at)} · {hour(modal.starts_at)}
                </p>
                <form onSubmit={joinSession}>
                  <label>
                    {t("اسمك")}
                    <input
                      required
                      maxLength={70}
                      placeholder={t("اسمك")}
                      value={person.name}
                      onChange={(e) =>
                        setPerson({ ...person, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("رقم جوالك")}
                    <input
                      required
                      type="tel"
                      dir="ltr"
                      inputMode="numeric"
                      placeholder="05XXXXXXXX"
                      value={person.phone}
                      onChange={(e) =>
                        setPerson({
                          ...person,
                          phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                        })
                      }
                    />
                  </label>
                  <IconButton
                    icon={Heart}
                    className="primary full"
                    disabled={busy}
                  >
                    {t("تسجيل الاهتمام")}
                  </IconButton>
                </form>
                <small>{t("بعد التسجيل بتظهر لك تعليمات الدفع.")}</small>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
