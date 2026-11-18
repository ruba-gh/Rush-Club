import React, { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";

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

const emptyAnswer = () => ({ sport: "", day: "", period: "", regions: [] });

function periodSymbol(period) {
  if (morningTimes.includes(period)) return "☀️";
  if (eveningTimes.includes(period)) return "🌙";
  return null;
}

export function WishBoard({ db, weekStart, t, flash }) {
  const [options, setOptions] = useState([]);
  const [status, setStatus] = useState("loading");
  const [answer, setAnswer] = useState(null);
  const [isSuggested, setIsSuggested] = useState(false);
  const [person, setPerson] = useState({ name: "", phone: "" });
  const [sportFilter, setSportFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef(null);
  const openButton = useRef(null);

  async function loadOptions() {
    if (!db) return setStatus("error");
    const { data, error } = await db.rpc("rush_weekly_play_options");
    if (error) return setStatus("error");
    setOptions(data || []);
    setStatus("ready");
  }

  useEffect(() => {
    loadOptions();
  }, [db]);

  function openForm(event, option) {
    openButton.current = event.currentTarget;
    setIsSuggested(Boolean(option));
    setAnswer(
      option
        ? {
            sport: option.sport,
            day: option.day,
            period: option.period,
            regions: option.regions.length === 1 ? [...option.regions] : [],
          }
        : emptyAnswer(),
    );
    requestAnimationFrame(() => {
      form.current?.focus({ preventScroll: true });
      form.current?.scrollIntoView({ block: "nearest" });
    });
  }

  function closeForm() {
    setAnswer(null);
    openButton.current?.focus();
  }

  async function save(event) {
    event.preventDefault();
    if (!person.name.trim() || !/^05\d{8}$/.test(person.phone)) {
      return flash("تأكدي من الاسم ورقم الجوال");
    }
    if (!answer.regions.length) return flash("اختاري منطقة وحدة على الأقل");
    if (!db || busy) return;
    setBusy(true);
    const { error } = await db.rpc("save_preference", {
      p_name: person.name.trim(),
      p_phone: person.phone,
      p_sport: answer.sport,
      p_day: answer.day,
      p_period: answer.period,
      p_regions: answer.regions,
      p_week_start: weekStart(),
    });
    setBusy(false);
    if (error) return flash("تعذر حفظ الرغبة. جربي مرة ثانية.");
    if (!isSuggested) setSportFilter("");
    closeForm();
    flash("تم حفظ اختيارك!");
    await loadOptions();
  }

  const visible = options.filter(
    (option) => !sportFilter || option.sport === sportFilter,
  );

  return (
    <div className="wish-board">
      <div className="wish-board-toolbar">
        <button className="btn primary" type="button" onClick={openForm}>
          <Plus size={17} /> {t("أضيفي اختيارك")}
        </button>
        {status === "ready" && options.length > 0 && (
          <label className="wish-sport-filter">
            <span>{t("الرياضة")}</span>
            <select
              value={sportFilter}
              onChange={(event) => setSportFilter(event.target.value)}
            >
              <option value="">{t("كل الرياضات")}</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>
                  {t(sport)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {answer && (
        <form
          ref={form}
          tabIndex={-1}
          className="panel form-panel wish-vote-form"
          onSubmit={save}
        >
          <h3>
            {isSuggested
              ? [
                  t(answer.day),
                  t(answer.period || "أي وقت"),
                  t(answer.sport),
                ].join(" · ")
              : t("أضيفي اختيارك")}
          </h3>
          <fieldset className="wish-fieldset" disabled={busy}>
            {!isSuggested && (
              <div className="fields">
                <label>
                  {t("اليوم")}
                  <select
                    required
                    value={answer.day}
                    onChange={(event) =>
                      setAnswer({
                        ...answer,
                        day: event.target.value,
                        period: "",
                      })
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
                  {t("الوقت (اختياري)")}
                  <select
                    value={answer.period}
                    onChange={(event) =>
                      setAnswer({ ...answer, period: event.target.value })
                    }
                  >
                    <option value="">{t("أي وقت")}</option>
                    {periodsForDay(answer.day).map((period) => (
                      <option key={period} value={period}>
                        {t(period)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("الرياضة")}
                  <select
                    required
                    value={answer.sport}
                    onChange={(event) =>
                      setAnswer({ ...answer, sport: event.target.value })
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
              </div>
            )}
            <fieldset className="wish-filter-group">
              <legend>{t("اختاري المناطق اللي تناسبك")}</legend>
              <div className="wish-filter-options">
                {regions.map((region) => {
                  const checked = answer.regions.includes(region);
                  return (
                    <label
                      key={region}
                      className={
                        "wish-filter-option " + (checked ? "active" : "")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAnswer({
                            ...answer,
                            regions: checked
                              ? answer.regions.filter((area) => area !== region)
                              : [...answer.regions, region],
                          })
                        }
                      />
                      {t(region)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="fields">
              <label>
                {t("اسمك")}
                <input
                  value={person.name}
                  required
                  maxLength={70}
                  autoComplete="given-name"
                  onChange={(event) =>
                    setPerson({ ...person, name: event.target.value })
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
                  onChange={(event) =>
                    setPerson({
                      ...person,
                      phone: event.target.value.replace(/\D/g, "").slice(0, 10),
                    })
                  }
                />
              </label>
            </div>
            <div className="wish-actions">
              <button className="btn primary" type="submit">
                <Check size={17} /> {t("احفظي اختياري")}
              </button>
              <button className="text-button" type="button" onClick={closeForm}>
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
          <button type="button" className="text-button" onClick={loadOptions}>
            {t("إعادة المحاولة")}
          </button>
        </div>
      )}
      {status === "ready" && !visible.length && (
        <div className="empty">
          {t(
            options.length
              ? "ما فيه رغبات مطابقة."
              : "ما فيه اختيارات هالأسبوع. أضيفي أول اختيار!",
          )}
        </div>
      )}
      {status === "ready" &&
        days.map((day) => {
          const timeOrder = [...periodsForDay(day), ""];
          const dayOptions = visible
            .filter((option) => option.day === day)
            .sort(
              (a, b) =>
                timeOrder.indexOf(a.period) - timeOrder.indexOf(b.period) ||
                Number(b.player_count) - Number(a.player_count),
            );
          if (!dayOptions.length) return null;
          return (
            <section key={day} className="wish-day">
              <h3>{t(day)}</h3>
              <div className="wish-card-grid">
                {dayOptions.map((option) => (
                  <article
                    className="panel wish-vote-card"
                    key={JSON.stringify([option.sport, option.period])}
                  >
                    <div className="wish-card-head">
                      <h4>
                        <span aria-hidden="true">
                          {option.sport === "تنس ريشة" ? "🏸" : "🎾"}
                        </span>
                        {t(option.sport)}
                      </h4>
                      <span
                        className="seat-pill"
                        role="img"
                        aria-label={
                          option.player_count + " " + t("لاعبات مهتمات")
                        }
                      >
                        <span aria-hidden="true">🏃‍♀️</span>
                        {option.player_count}
                      </span>
                    </div>
                    <p className="wish-card-time">
                      {periodSymbol(option.period) && (
                        <span aria-hidden="true">
                          {periodSymbol(option.period)}
                        </span>
                      )}
                      {t(option.period || "أي وقت")}
                    </p>
                    {option.regions.length > 0 && (
                      <p className="wish-card-regions">
                        {regions
                          .filter((region) => option.regions.includes(region))
                          .map((region) => t(region.replace(" الرياض", "")))
                          .join(" · ")}
                      </p>
                    )}
                    <button
                      className="btn wish-join"
                      type="button"
                      onClick={(event) => openForm(event, option)}
                    >
                      <Check size={16} /> {t("يناسبني")}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
