import React, { useEffect, useState } from "react";
import { Bell, BellOff, Heart, Plus } from "lucide-react";

export const sports = ["تنس ريشة", "بادل", "تنس"];
export const days = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export const regions = [
  "شمال الرياض",
  "جنوب الرياض",
  "شرق الرياض",
  "غرب الرياض",
  "وسط الرياض",
];
export const eveningTimes = ["٥–٧ مساءً", "٧–٩ مساءً"];
export const morningTimes = ["٨–١٠ صباحًا", "١٠–١٢ صباحًا"];
export const periodsForDay = (day) =>
  days.slice(-2).includes(day)
    ? [...morningTimes, ...eveningTimes]
    : eveningTimes;

export const wishKey = ({ sport, day, period, region }) =>
  JSON.stringify([sport, day, period, region]);
const wishArguments = ({ sport, day, period, region }) => ({
  p_sport: sport,
  p_day: day,
  p_period: period,
  p_region: region,
});
const emptyWish = () => ({ sport: "", day: "", period: "", region: "" });
const deviceKey = "rush-wish-device";

export function useWishAlerts(db, enabled) {
  const [device, setDevice] = useState(() =>
    enabled ? localStorage.getItem(deviceKey) : null,
  );
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!db || !device || !enabled) return;
    let active = true;
    const refresh = async () => {
      if (document.hidden) return;
      const result = await db.rpc("rush_get_wish_alerts", {
        p_device_id: device,
      });
      if (!active) return;
      setError(Boolean(result.error));
      if (!result.error) setAlerts(result.data || []);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60_000);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [db, device, enabled]);

  async function toggleAlert(wish, subscribe) {
    if (!db || pending) return false;
    setPending(true);
    try {
      const id = device || crypto.randomUUID();
      if (!device) localStorage.setItem(deviceKey, id);
      const result = await db.rpc("rush_set_wish_alert", {
        p_device_id: id,
        ...wishArguments(wish),
        p_enabled: subscribe,
      });
      if (result.error) return false;
      setDevice(id);
      const updated = await db.rpc("rush_get_wish_alerts", { p_device_id: id });
      if (updated.error) return false;
      setAlerts(updated.data || []);
      setError(false);
      return (
        (updated.data || []).some(
          (entry) => wishKey(entry) === wishKey(wish),
        ) === subscribe
      );
    } catch {
      return false;
    } finally {
      setPending(false);
    }
  }

  return { alerts, error, pending, toggleAlert };
}

export function wishDetails(wish, t) {
  return [
    t(wish.day),
    wish.period ? t(wish.period) : t("أي وقت"),
    t(wish.region),
  ].join(" · ");
}

export function WishAlertPanel({
  alerts,
  error,
  pending,
  onToggle,
  onSession,
  sessions,
  t,
}) {
  return (
    <section
      className="panel wish-alert-panel"
      id="wish-alerts"
      aria-labelledby="wish-alert-heading"
    >
      <h2 id="wish-alert-heading">{t("تنبيهات الرغبات")}</h2>
      <p>{t("بتشوفين المواعيد المطابقة لرغباتك هنا على نفس المتصفح.")}</p>
      {error && <p role="status">{t("تعذر تحميل التنبيهات. جربي بعد شوي.")}</p>}
      {!error && !alerts.length && (
        <p>{t("فعّلي الجرس على أي رغبة عشان تتابعينها هنا.")}</p>
      )}
      {alerts.map((alert) => (
        <article className="wish-alert-row" key={wishKey(alert)}>
          <div>
            <strong>{t(alert.sport)}</strong>
            <p>{wishDetails(alert, t)}</p>
            {alert.session_ids.length ? (
              alert.session_ids.map((id) => (
                <button
                  className="text-button"
                  key={id}
                  type="button"
                  onClick={() => onSession(id)}
                >
                  {sessions.find((session) => session.id === id)?.venue ||
                    t("عرض الموعد المطابق")}
                </button>
              ))
            ) : (
              <small>{t("بانتظار موعد مطابق")}</small>
            )}
          </div>
          <button
            className="btn"
            type="button"
            disabled={pending}
            onClick={() => onToggle(alert, false)}
            aria-label={t("إيقاف التنبيه")}
            title={t("إيقاف التنبيه")}
          >
            <BellOff size={16} />
          </button>
        </article>
      ))}
    </section>
  );
}

export function WishBoard({ db, alerts, pending, onToggle, t, flash }) {
  const [wishes, setWishes] = useState([]);
  const [status, setStatus] = useState("loading");
  const [mode, setMode] = useState(null);
  const [wish, setWish] = useState(emptyWish);
  const [person, setPerson] = useState({ name: "", phone: "" });
  const [notify, setNotify] = useState(false);
  const [filters, setFilters] = useState({ sport: "", day: "", region: "" });
  const [busy, setBusy] = useState(false);

  async function loadWishes() {
    if (!db) return setStatus("error");
    const { data, error } = await db.rpc("rush_public_wishes");
    if (error) return setStatus("error");
    setWishes(data || []);
    setStatus("ready");
  }

  useEffect(() => {
    loadWishes();
  }, [db]);

  function openForm(type, selection = emptyWish()) {
    setMode(type);
    setWish(selection);
    setNotify(false);
  }

  async function save(e) {
    e.preventDefault();
    if (!person.name.trim() || !/^05\d{8}$/.test(person.phone)) {
      return flash("تأكدي من الاسم ورقم الجوال");
    }
    if (!db || busy) return;
    setBusy(true);
    const { error } = await db.rpc("rush_vote_wish", {
      p_name: person.name.trim(),
      p_phone: person.phone,
      ...wishArguments(wish),
    });
    if (error) {
      setBusy(false);
      return flash("تعذر حفظ الرغبة. جربي مرة ثانية.");
    }
    flash(mode === "add" ? "وصلتنا رغبتك!" : "تم تسجيل صوتك!");
    if (mode === "add") setFilters({ sport: "", day: "", region: "" });
    if (notify) await onToggle(wish, true);
    await loadWishes();
    setBusy(false);
    setMode(null);
  }

  const visibleWishes = wishes.filter((entry) =>
    Object.entries(filters).every(
      ([field, value]) => !value || entry[field] === value,
    ),
  );

  return (
    <div className="wish-board">
      <button
        className="btn primary"
        type="button"
        onClick={() => openForm("add")}
      >
        <Plus size={17} /> {t("إضافة رغبة")}
      </button>
      {mode && (
        <form className="panel form-panel wish-vote-form" onSubmit={save}>
          <h3>{mode === "add" ? t("إضافة رغبة") : t("تصويت على رغبة")}</h3>
          {mode === "vote" && (
            <p>
              {t(wish.sport)} · {wishDetails(wish, t)}
            </p>
          )}
          <fieldset className="wish-fieldset" disabled={busy}>
            {mode === "add" && (
              <div className="fields">
                <label>
                  {t("الرياضة")}
                  <select
                    required
                    value={wish.sport}
                    onChange={(e) =>
                      setWish({ ...wish, sport: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      {t("اختاري رياضة")}
                    </option>
                    {sports.map((sport) => (
                      <option key={sport} value={sport}>
                        {t(sport)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("اليوم")}
                  <select
                    required
                    value={wish.day}
                    onChange={(e) =>
                      setWish({ ...wish, day: e.target.value, period: "" })
                    }
                  >
                    <option value="" disabled>
                      {t("اختاري يوم")}
                    </option>
                    {days.map((day) => (
                      <option key={day} value={day}>
                        {t(day)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("المنطقة")}
                  <select
                    required
                    value={wish.region}
                    onChange={(e) =>
                      setWish({ ...wish, region: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      {t("اختاري منطقة")}
                    </option>
                    {regions.map((region) => (
                      <option key={region} value={region}>
                        {t(region)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("الوقت (اختياري)")}
                  <select
                    value={wish.period}
                    onChange={(e) =>
                      setWish({ ...wish, period: e.target.value })
                    }
                  >
                    <option value="">{t("أي وقت")}</option>
                    {periodsForDay(wish.day).map((period) => (
                      <option key={period} value={period}>
                        {t(period)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="fields">
              <label>
                {t("اسمك")}
                <input
                  value={person.name}
                  required
                  maxLength={70}
                  autoComplete="given-name"
                  onChange={(e) =>
                    setPerson({ ...person, name: e.target.value })
                  }
                />
              </label>
              <label>
                {t("رقم جوالك")}
                <input
                  type="tel"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  required
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
            </div>
            <label className="wish-notify-choice">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              <Bell size={16} /> {t("علموني لو فيه")}
            </label>
            <div className="wish-actions">
              <button className="btn primary" type="submit">
                <Heart size={17} /> {t(mode === "add" ? "حفظ رغبتي" : "صوتي")}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setMode(null)}
              >
                {t("إلغاء")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {status === "loading" && <p role="status">{t("جاري تحميل الرغبات…")}</p>}
      {status === "error" && (
        <div className="empty">
          {t("تعذر تحميل الرغبات.")}{" "}
          <button className="text-button" onClick={loadWishes}>
            {t("إعادة المحاولة")}
          </button>
        </div>
      )}
      {status === "ready" && !wishes.length && (
        <div className="empty">
          {t("ما فيه رغبات لهذا الأسبوع. أضيفي أول رغبة!")}
        </div>
      )}
      {status === "ready" && wishes.length > 0 && (
        <div className="fields wish-board-filters">
          {[
            ["sport", "الرياضة", "كل الرياضات", sports],
            ["day", "اليوم", "كل الأيام", days],
            ["region", "المنطقة", "كل المناطق", regions],
          ].map(([field, label, all, options]) => (
            <label key={field}>
              {t(label)}
              <select
                value={filters[field]}
                onChange={(e) =>
                  setFilters({ ...filters, [field]: e.target.value })
                }
              >
                <option value="">{t(all)}</option>
                {options.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {status === "ready" && wishes.length > 0 && !visibleWishes.length && (
        <div className="empty">{t("ما فيه رغبات مطابقة.")}</div>
      )}
      <div className="wish-card-grid">
        {visibleWishes.map((entry) => {
          const key = wishKey(entry);
          const subscribed = alerts.some((alert) => wishKey(alert) === key);
          return (
            <article className="panel wish-vote-card" key={key}>
              <div className="wish-card-head">
                <h3>{t(entry.sport)}</h3>
                <span className="seat-pill">
                  {entry.votes} {t(Number(entry.votes) === 1 ? "صوت" : "أصوات")}
                </span>
              </div>
              <p>{wishDetails(entry, t)}</p>
              <div className="wish-actions">
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => {
                    openForm("vote", entry);
                    requestAnimationFrame(() =>
                      document
                        .querySelector(".wish-vote-form")
                        ?.scrollIntoView({ block: "center" }),
                    );
                  }}
                >
                  <Heart size={16} /> {t("صوتي")}
                </button>
                <button
                  className="btn"
                  type="button"
                  aria-pressed={subscribed}
                  disabled={pending}
                  onClick={() => onToggle(entry, !subscribed)}
                >
                  <Bell size={16} />{" "}
                  {t(subscribed ? "التنبيه مفعّل" : "علموني لو فيه")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
