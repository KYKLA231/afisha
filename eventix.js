/* Eventix: афиша и билеты через Supabase (один файл с eventix.html). */

const COVERS_BUCKET = "covers";

function eventixSupabaseUrl() {
  return String((typeof window !== "undefined" && window.EVENTIX_SUPABASE_URL) || "").trim();
}
function eventixSupabaseKey() {
  return String((typeof window !== "undefined" && window.EVENTIX_SUPABASE_ANON_KEY) || "").trim();
}

/** Пересоздаёт клиент из window (удобно после правок в HTML и при «залипшем» кэше). */
let supabase = null;
function rebuildSupabaseClient() {
  const u = eventixSupabaseUrl();
  const k = eventixSupabaseKey();
  const create = typeof window !== "undefined" && window.supabase && typeof window.supabase.createClient === "function";
  if (!create) {
    supabase = null;
    return;
  }
  if (!u || !k || u.startsWith("PASTE_") || k.startsWith("PASTE_") || k.startsWith("sb_secret_")) {
    supabase = null;
    return;
  }
  try {
    supabase = window.supabase.createClient(u, k);
  } catch {
    supabase = null;
  }
}

rebuildSupabaseClient();

const state = {
  currentFilter: "all",
  currentEvent: null,
  currentTierIdx: 0,
  qty: 1,
  myTickets: [],
  source: "supabase",
  events: [],
  lastLoadedAt: null,
  loadEventsError: null,
  draftCoverDataUrl: "",
  draftCoverFile: null,
  user: null,
  _placeSearchItems: [],
};

const catUi = {
  all: { label: "Все", emoji: "•" },
  music: { label: "Музыка", emoji: "" },
  art: { label: "Искусство", emoji: "" },
  sport: { label: "Спорт", emoji: "" },
  food: { label: "Гастрономия", emoji: "" },
  tech: { label: "Технологии", emoji: "" },
  theater: { label: "Театр", emoji: "" },
};

const catLabelMap = {
  music: "Музыка",
  art: "Искусство",
  sport: "Спорт",
  food: "Гастрономия",
  tech: "Технологии",
  theater: "Театр",
};

const catPreviewMap = { music: "MUSIC", art: "ART", sport: "SPORT", food: "FOOD", tech: "TECH", theater: "THEATER" };

function supabaseReady() {
  const u = eventixSupabaseUrl();
  const k = eventixSupabaseKey();
  const lib = typeof window !== "undefined" && window.supabase && typeof window.supabase.createClient === "function";
  if (!lib) return false;
  if (!u || !k || u.startsWith("PASTE_") || k.startsWith("PASTE_")) return false;
  if (k.startsWith("sb_secret_")) return false;
  if (!supabase) rebuildSupabaseClient();
  return !!supabase;
}

async function loadRuntimeConfig() {
  const hasInlineConfig = eventixSupabaseUrl() && eventixSupabaseKey();
  if (hasInlineConfig) return;
  try {
    const resp = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!resp.ok) return;
    const json = await resp.json();
    const url = String(json?.supabaseUrl || "").trim();
    const key = String(json?.supabaseAnonKey || "").trim();
    if (url) window.EVENTIX_SUPABASE_URL = url;
    if (key) window.EVENTIX_SUPABASE_ANON_KEY = key;
  } catch {
    /* ignore network errors, keep current behavior */
  }
}

window.showPage = showPage;
window.scrollToEvents = scrollToEvents;
window.setFilter = setFilter;
window.filterEvents = filterEvents;
window.openModal = openModal;
window.closeModal = closeModal;
window.changeQty = changeQty;
window.selectTier = selectTier;
window.confirmBooking = confirmBooking;
window.updatePreview = updatePreview;
window.publishEvent = publishEvent;
window.reloadEvents = reloadEvents;
window.openPlacePicker = openPlacePicker;
window.closePlacePicker = closePlacePicker;
window.searchPlaces = searchPlaces;
window.selectPlace = selectPlace;
window.openMapModal = openMapModal;
window.closeMapModal = closeMapModal;
window.authSignIn = authSignIn;
window.authSignUp = authSignUp;
window.authSignOut = authSignOut;
window.showAuthTab = showAuthTab;
window.openQrModal = openQrModal;
window.closeQrModal = closeQrModal;

let _leafletMap = null;
let _leafletMarker = null;

function syncAuthUi() {
  const u = state.user;
  const label = document.getElementById("auth-email-label");
  const logout = document.getElementById("auth-logout");
  const entry = document.getElementById("nav-auth-entry");
  if (label) {
    label.style.display = u ? "inline" : "none";
    if (u?.email) label.textContent = u.email;
  }
  if (logout) logout.style.display = u ? "inline-flex" : "none";
  if (entry) entry.style.display = u ? "none" : "inline-flex";
}

function showAuthTab(which) {
  const loginTab = document.getElementById("auth-tab-login");
  const regTab = document.getElementById("auth-tab-register");
  const loginPanel = document.getElementById("panel-login");
  const regPanel = document.getElementById("panel-register");
  const isLogin = which === "login";
  if (loginTab) loginTab.classList.toggle("active", isLogin);
  if (regTab) regTab.classList.toggle("active", !isLogin);
  if (loginPanel) loginPanel.classList.toggle("active", isLogin);
  if (regPanel) regPanel.classList.toggle("active", !isLogin);
}

function firstNavHomeBtn() {
  return document.querySelector(".nav-btn");
}

async function authSignIn() {
  if (!supabaseReady()) return showToast("Supabase", "Заполни EVENTIX_SUPABASE_URL и EVENTIX_SUPABASE_ANON_KEY в .env");
  const email = String(document.getElementById("auth-login-email")?.value || "").trim();
  const password = String(document.getElementById("auth-login-password")?.value || "").trim();
  if (!email || !password) return showToast("Ошибка", "Введи email и пароль");
  if (!isValidEmail(email)) return showToast("Ошибка", "Проверь формат email");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showToast("Вход", error.message);
  showToast("С возвращением", email);
  showPage("home", firstNavHomeBtn());
}

async function authSignUp() {
  if (!supabaseReady()) return showToast("Supabase", "Заполни EVENTIX_SUPABASE_URL и EVENTIX_SUPABASE_ANON_KEY в .env");
  const email = String(document.getElementById("auth-register-email")?.value || "").trim();
  const password = String(document.getElementById("auth-register-password")?.value || "").trim();
  const password2 = String(document.getElementById("auth-register-password2")?.value || "").trim();
  if (!email || !password) return showToast("Ошибка", "Заполни email и пароль");
  if (!isValidEmail(email)) return showToast("Ошибка", "Проверь формат email");
  if (password.length < 6) return showToast("Ошибка", "Пароль не короче 6 символов");
  if (password !== password2) return showToast("Ошибка", "Пароли не совпадают");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return showToast("Регистрация", error.message);
  if (data.session) {
    showToast("Аккаунт создан", "Можно покупать билеты.");
    showPage("home", firstNavHomeBtn());
  } else {
    showToast("Проверь почту", "Подтверди email в Supabase Auth.");
  }
}

async function authSignOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  showToast("Выход", "До встречи");
}

function openPlacePicker() {
  document.getElementById("place-modal")?.classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("place-query")?.focus(), 0);
}

function closePlacePicker() {
  document.getElementById("place-modal")?.classList.remove("open");
  document.body.style.overflow = "";
}

async function searchPlaces() {
  const q = String(document.getElementById("place-query")?.value || "").trim();
  const out = document.getElementById("place-results");
  if (!out) return;
  if (!q) {
    out.innerHTML = `<div class="hint">Введите запрос.</div>`;
    return;
  }
  out.innerHTML = `<div class="hint">Поиск…</div>`;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    const items = (Array.isArray(json) ? json : []).map((it) => {
      const name = it?.display_name?.split(",")?.[0]?.trim() || it?.name || "Место";
      const address = it?.display_name || "";
      const lat = it?.lat ? Number(it.lat) : null;
      const lon = it?.lon ? Number(it.lon) : null;
      const coords = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat},${lon}` : "";
      return { name, address, text: address, coords };
    });
    if (!items.length) {
      out.innerHTML = `<div class="hint">Ничего не найдено.</div>`;
      return;
    }
    out.innerHTML = `
      <div class="place-list">
        ${items
          .map(
            (it, idx) => `
          <button class="place-item" type="button" onclick="selectPlace(${idx})">
            <div class="place-name">${escapeHtml(it.name || it.text || "Место")}</div>
            <div class="place-addr">${escapeHtml(it.address || it.text || "")}</div>
            <div class="place-meta">${escapeHtml(it.coords || "")}</div>
          </button>
        `,
          )
          .join("")}
      </div>
    `;
    state._placeSearchItems = items;
  } catch {
    out.innerHTML = `<div class="hint">Ошибка поиска. Проверь соединение.</div>`;
  }
}

function selectPlace(idx) {
  const items = state._placeSearchItems || [];
  const it = items[idx];
  if (!it) return;
  const venue = it.address || it.text || it.name || "";
  const coords = it.coords || "";
  const venueInput = document.getElementById("ev-venue");
  const coordsInput = document.getElementById("ev-coords");
  if (venueInput) venueInput.value = venue;
  if (coordsInput) coordsInput.value = coords;
  updatePreview();
  closePlacePicker();
  showToast("Место выбрано", venue);
}

function openMapModal(title, subtitle, coords) {
  const modal = document.getElementById("map-modal");
  if (!modal) return;
  document.getElementById("map-title").textContent = title || "Карта";
  document.getElementById("map-subtitle").textContent = subtitle || "";
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  const parsed = parseCoords(coords);
  const center = parsed || { lat: 55.751244, lon: 37.618423 };
  setTimeout(() => {
    if (!_leafletMap) {
      _leafletMap = L.map("map", { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(_leafletMap);
    }
    _leafletMap.invalidateSize();
    _leafletMap.setView([center.lat, center.lon], parsed ? 15 : 11);
    if (_leafletMarker) _leafletMarker.remove();
    if (parsed) _leafletMarker = L.marker([parsed.lat, parsed.lon]).addTo(_leafletMap);
  }, 0);
}

function closeMapModal() {
  document.getElementById("map-modal")?.classList.remove("open");
  document.body.style.overflow = "";
}

function parseCoords(coords) {
  const s = String(coords || "").trim();
  if (!s) return null;
  const parts = s.split(",").map((x) => x.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadRuntimeConfig();
  rebuildSupabaseClient();
  const evDate = document.getElementById("ev-date");
  if (evDate) evDate.min = new Date().toISOString().split("T")[0];
  syncSourceUi();
  wireCoverUpload();
  if (!window.supabase?.createClient) {
    showToast("Скрипт Supabase", "Не загрузился CDN — проверь сеть или блокировщик");
    reloadEvents().catch(() => {});
    renderTickets();
  } else if (supabaseReady()) {
    supabase.auth.onAuthStateChange((_e, session) => {
      state.user = session?.user ?? null;
      syncAuthUi();
      reloadEvents().catch(() => {});
      loadMyTickets().catch(() => {});
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      state.user = session?.user ?? null;
      syncAuthUi();
      reloadEvents().catch(() => {});
      loadMyTickets().catch(() => {});
    });
  } else {
    syncAuthUi();
    state.loadEventsError = "config";
    showToast("Supabase", "Заполни .env и перезапусти сервер");
    reloadEvents().catch(() => {});
    renderTickets();
  }
});

function mapSupabaseRow(row) {
  const types = Array.isArray(row.ticket_types) ? [...row.ticket_types] : [];
  types.sort((a, b) => (Number(a.price_rub) || 0) - (Number(b.price_rub) || 0));
  const tiers = types.map((t) => ({
    name: t.name || "Билет",
    price: Number(t.price_rub) || 0,
    desc: Number.isFinite(Number(t.remaining_qty)) ? `${Number(t.remaining_qty)} осталось` : "",
    ticketTypeId: t.id,
    remaining: Number(t.remaining_qty),
  }));
  const minPrice = tiers.length ? Math.min(...tiers.map((t) => t.price)) : null;
  const seatsLeft = types.reduce((s, t) => s + (Number.isFinite(Number(t.remaining_qty)) ? Number(t.remaining_qty) : 0), 0);
  const totalSeats = types.reduce((s, t) => s + (Number.isFinite(Number(t.total_qty)) ? Number(t.total_qty) : 0), 0);
  const starts = row.starts_at ? new Date(row.starts_at) : null;
  const venue = [row.venue_name, row.venue_address].filter(Boolean).join(" · ") || "Место уточняется";
  return normalizeEvents([
    {
      id: String(row.id),
      source: "supabase",
      title: row.title || "Без названия",
      cat: row.category || guessCategory({ title: row.title }),
      catLabel: catLabelMap[row.category] || row.category || "Событие",
      venue,
      city: row.city || "",
      dateLabel: starts && !Number.isNaN(starts.getTime()) ? formatDateShortRu(starts) : "скоро",
      fullDate:
        starts && !Number.isNaN(starts.getTime())
          ? starts.toLocaleString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "скоро",
      priceFrom: minPrice,
      seatsLeft: tiers.length ? seatsLeft : null,
      totalSeats: tiers.length ? totalSeats : null,
      tiers: tiers.length ? tiers : defaultTiersFromPrice(minPrice),
      url: null,
      imageUrl: row.cover_url || null,
      imageDataUrl: null,
      coords: null,
    },
  ])[0];
}

async function reloadEvents() {
  if (!supabaseReady()) {
    state.events = [];
    state.loadEventsError = "config";
    filterEvents();
    return;
  }
  try {
    state.loadEventsError = null;
    let { data, error } = await supabase
      .from("events")
      .select(
        `
        *,
        ticket_types ( id, name, price_rub, total_qty, remaining_qty )
      `,
      )
      .order("starts_at", { ascending: true });

    const errMsg = String(error?.message || "");
    if (
      error &&
      (errMsg.includes("Could not find a relationship") ||
        errMsg.includes("relationship") ||
        errMsg.includes("PGRST200") ||
        errMsg.includes("schema cache"))
    ) {
      const r2 = await supabase.from("events").select("*").order("starts_at", { ascending: true });
      data = r2.data;
      error = r2.error;
    }

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    state.events = rows.map(mapSupabaseRow).filter(Boolean);
    state.lastLoadedAt = new Date();
    updateSourceBadge("Supabase");
    filterEvents();
  } catch (err) {
    console.error(err);
    state.events = [];
    state.loadEventsError = String(err?.message || err);
    filterEvents();
    showToast("Не удалось загрузить афишу", state.loadEventsError);
  }
}

function mergeEvents(primary, secondary) {
  const map = new Map();
  for (const e of secondary) map.set(String(e.id), e);
  for (const e of primary) map.set(String(e.id), e);
  return Array.from(map.values());
}

function normalizeEvents(events) {
  return events
    .filter(Boolean)
    .map((e) => ({
      id: String(e.id),
      source: e.source || state.source,
      title: e.title || "Без названия",
      cat: e.cat || guessCategory(e),
      catLabel: e.catLabel || catUi[e.cat]?.label || "Событие",
      venue: e.venue || "Место уточняется",
      city: e.city || "",
      dateLabel: e.dateLabel || e.date || "скоро",
      fullDate: e.fullDate || e.dateTime || e.dateLabel || "скоро",
      priceFrom: Number.isFinite(e.priceFrom) ? e.priceFrom : Number.isFinite(e.price) ? e.price : null,
      seatsLeft: Number.isFinite(e.seatsLeft) ? e.seatsLeft : Number.isFinite(e.seats) ? e.seats : null,
      totalSeats: Number.isFinite(e.totalSeats) ? e.totalSeats : Number.isFinite(e.total) ? e.total : null,
      emoji: e.emoji || catFallbackEmoji(e.cat),
      tiers: Array.isArray(e.tiers) && e.tiers.length ? e.tiers : defaultTiersFromPrice(e.priceFrom ?? e.price),
      url: e.url || null,
      imageUrl: e.imageUrl || e.image || null,
      imageDataUrl: e.imageDataUrl || null,
      coords: e.coords || null,
    }));
}

function defaultTiersFromPrice(priceFrom) {
  const base = Number.isFinite(priceFrom) ? Math.max(0, Math.round(priceFrom)) : 0;
  if (!base) return [{ name: "Стандарт", price: 0, desc: "" }];
  return [
    { name: "Стандарт", price: base, desc: "" },
    { name: "Премиум", price: Math.round(base * 1.6), desc: "" },
  ];
}

function guessCategory(e) {
  const t = (e.title || "").toLowerCase();
  if (t.includes("театр") || t.includes("спектак")) return "theater";
  if (t.includes("выстав") || t.includes("арт")) return "art";
  if (t.includes("матч") || t.includes("vs") || t.includes("футбол") || t.includes("хокке")) return "sport";
  if (t.includes("conf") || t.includes("dev") || t.includes("it") || t.includes("ai")) return "tech";
  if (t.includes("wine") || t.includes("gastro") || t.includes("еда") || t.includes("фест")) return "food";
  return "music";
}

function catFallbackEmoji() {
  return "";
}

function cardMarkByCat(cat) {
  switch (cat) {
    case "music":
      return "MUSIC";
    case "art":
      return "ART";
    case "sport":
      return "SPORT";
    case "food":
      return "FOOD";
    case "tech":
      return "TECH";
    case "theater":
      return "THEATER";
    default:
      return "EVENT";
  }
}

function renderEvents(list) {
  const grid = document.getElementById("events-grid");
  const countEl = document.getElementById("events-count");
  if (countEl) countEl.textContent = list.length ? `${list.length} событий` : "Нет событий";
  if (!grid) return;
  if (!list.length) {
    if (!supabaseReady()) {
      const libOk = typeof window !== "undefined" && !!window.supabase?.createClient;
      const u = eventixSupabaseUrl();
      const k = eventixSupabaseKey();
      const urlOk = u.length > 0 && !u.startsWith("PASTE_");
      const keyOk = k.length > 0 && !k.startsWith("PASTE_");
      const secretByMistake = k.startsWith("sb_secret_");
      grid.innerHTML = `<div class="events-empty events-empty--warn" style="grid-column:1/-1">
        <div class="events-empty-title">События пока не загружены</div>
        <p class="events-empty-text">Проверь переменные <code>EVENTIX_SUPABASE_URL</code> и <code>EVENTIX_SUPABASE_ANON_KEY</code> в <code>.env</code>, затем перезапусти сервер.</p>
        <p class="events-empty-text muted">Текущий статус: Supabase CDN ${libOk ? "загружен" : "не загружен"}, URL ${urlOk ? "есть" : "не задан"}, ключ ${secretByMistake ? "ошибка (secret)" : keyOk ? "есть" : "не задан"}.</p>
      </div>`;
      return;
    }
    if (state.loadEventsError && state.loadEventsError !== "config" && String(state.loadEventsError).length) {
      grid.innerHTML = `<div class="events-empty events-empty--err" style="grid-column:1/-1">
        <div class="events-empty-title">Ошибка загрузки</div>
        <p class="events-empty-text">${escapeHtml(state.loadEventsError)}</p>
        <p class="events-empty-text muted">Проверь RLS: для <code>events</code> и <code>ticket_types</code> нужен SELECT для роли <code>anon</code> (см. migrations/001_purchase_rls.sql).</p>
      </div>`;
      return;
    }
    grid.innerHTML = `<div class="events-empty" style="grid-column:1/-1">
      <div class="events-empty-title">Пока нет событий</div>
      <p class="events-empty-text">Войди и создай на вкладке «Создать событие» или выполни сид <code>supabase/seed_demo_rap_events.sql</code> в SQL Editor.</p>
    </div>`;
    return;
  }
  grid.innerHTML = list
    .map((e) => {
      const total = Number.isFinite(e.totalSeats) ? e.totalSeats : null;
      const left = Number.isFinite(e.seatsLeft) ? e.seatsLeft : null;
      const pct = total && left !== null ? Math.max(2, Math.min(100, Math.round(((total - left) / total) * 100))) : 40;
      const seatColor =
        left !== null && left < 30 ? "var(--danger)" : left !== null && left < 120 ? "rgba(110,231,255,.95)" : "var(--ok)";
      const seatsText = left === null ? "наличие уточняется" : `${left} осталось`;
      const priceText = Number.isFinite(e.priceFrom) ? `₽ ${Number(e.priceFrom).toLocaleString("ru")}` : "Цена уточняется";
      return `
      <div class="event-card" onclick="openModal('${escapeHtmlAttr(e.id)}')">
        ${renderCardCover(e)}
        <div class="event-body">
          <div class="event-meta">
            <span class="event-category">${escapeHtml(e.catLabel || catUi[e.cat]?.label || "Событие")}</span>
            <span class="event-date-badge">${escapeHtml(e.dateLabel || "скоро")}</span>
          </div>
          <div class="event-title">${escapeHtml(e.title)}</div>
          <div class="event-venue">${escapeHtml(e.venue)}</div>
          <div class="event-footer">
            <div class="event-price">${priceText} <small>${Number.isFinite(e.priceFrom) ? "/ билет" : ""}</small></div>
            <button class="btn-book" onclick="event.stopPropagation(); openModal('${escapeHtmlAttr(e.id)}')">Открыть</button>
          </div>
          <div class="event-seats">
            <span style="color:${seatColor}">${escapeHtml(seatsText)}</span>
            <div class="seats-bar"><div class="seats-fill" style="width:${pct}%;background:${seatColor}"></div></div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderCardCover(e) {
  const img = e.imageDataUrl || e.imageUrl || fallbackCoverUrlForEvent(e);
  if (img) {
    return `<div class="event-cover"><img class="event-image" alt="" src="${escapeHtmlAttr(img)}" loading="lazy" /></div>`;
  }
  return `<div class="event-image-placeholder"><span class="event-mark">${escapeHtml(cardMarkByCat(e.cat))}</span></div>`;
}

function fallbackCoverUrlForEvent(e) {
  // Free-to-use stock photos (Unsplash). We only use these as a fallback when event has no cover_url.
  const pools = {
    music: [
      "https://images.unsplash.com/photo-1522158637959-30385a09e0da?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1590721791974-d6c8ca43f6bc?auto=format&fit=crop&w=1400&q=70",
    ],
    art: [
      "https://images.unsplash.com/photo-1526481280695-3c687fd643ed?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1526318472351-c75fcf070305?auto=format&fit=crop&w=1400&q=70",
    ],
    sport: [
      "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=1400&q=70",
    ],
    food: [
      "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=1400&q=70",
    ],
    tech: [
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1518779578993-ec3579fee39f?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=70",
    ],
    theater: [
      "https://images.unsplash.com/photo-1507924538820-ede94a04019d?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1514306191717-452ec28c7814?auto=format&fit=crop&w=1400&q=70",
      "https://images.unsplash.com/photo-1461783436728-0a9217714693?auto=format&fit=crop&w=1400&q=70",
    ],
  };

  const cat = String(e?.cat || "music");
  const pool = pools[cat] || pools.music;
  if (!pool?.length) return null;
  const key = String(e?.title || e?.id || "");
  const idx = positiveHash(key) % pool.length;
  return pool[idx];
}

function positiveHash(s) {
  // small deterministic hash for picking a stable cover per title
  const str = String(s || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function getSearchQuery() {
  const el = document.getElementById("search-input");
  return (el?.value || "").trim();
}

function setFilter(cat, el) {
  document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
  if (el) el.classList.add("active");
  state.currentFilter = cat;
  filterEvents();
}

function filterEvents() {
  const q = getSearchQuery().toLowerCase();
  const list = state.events.filter((e) => {
    const matchCat = state.currentFilter === "all" || e.cat === state.currentFilter;
    const hay = `${e.title} ${e.venue} ${e.city}`.toLowerCase();
    const matchQ = !q || hay.includes(q);
    return matchCat && matchQ;
  });
  renderEvents(list);
}

function scrollToEvents() {
  document.getElementById("events-section")?.scrollIntoView({ behavior: "smooth" });
}

function openModal(id) {
  const ev = state.events.find((e) => String(e.id) === String(id));
  if (!ev) return;
  state.currentEvent = ev;
  state.currentTierIdx = 0;
  state.qty = 1;
  const coverWrap = document.getElementById("modal-cover");
  const coverSrc = ev.imageDataUrl || ev.imageUrl || fallbackCoverUrlForEvent(ev);
  if (coverWrap) {
    if (coverSrc) {
      coverWrap.style.display = "block";
      coverWrap.innerHTML = `<img alt="" src="${escapeHtmlAttr(coverSrc)}" loading="lazy" />`;
    } else {
      coverWrap.style.display = "none";
      coverWrap.innerHTML = "";
    }
  }
  document.getElementById("modal-emoji").textContent = cardMarkByCat(ev.cat);
  document.getElementById("modal-event-name").textContent = ev.title;
  document.getElementById("modal-event-date").textContent = `${ev.fullDate || ev.dateLabel || "скоро"} · ${ev.venue || ""}`.trim();
  document.getElementById("qty-display").textContent = String(state.qty);
  const buyerName = document.getElementById("buyer-name");
  const buyerEmail = document.getElementById("buyer-email");
  if (buyerName) buyerName.value = "";
  if (buyerEmail) buyerEmail.value = state.user?.email || "";
  document.getElementById("buyer-phone").value = "";
  document.getElementById("promo-code").value = "";
  let pick = 0;
  while (pick < ev.tiers.length && Number.isFinite(ev.tiers[pick]?.remaining) && ev.tiers[pick].remaining < 1) {
    pick++;
  }
  state.currentTierIdx = pick < ev.tiers.length ? pick : 0;
  renderTiers();
  updateSummary();
  document.getElementById("modal").classList.add("open");
  document.body.style.overflow = "hidden";
  const info = document.querySelector("#modal .modal-event-info");
  if (info) {
    let btn = document.getElementById("modal-map-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "modal-map-btn";
      btn.className = "btn-small";
      btn.type = "button";
      btn.style.marginLeft = "auto";
      btn.textContent = "Показать на карте";
      info.appendChild(btn);
    }
    if (ev.coords) {
      btn.style.display = "inline-flex";
      btn.onclick = () => openMapModal(ev.title, ev.venue, ev.coords);
    } else {
      btn.style.display = "none";
      btn.onclick = null;
    }
  }
}

function closeModal() {
  document.getElementById("modal")?.classList.remove("open");
  document.body.style.overflow = "";
}

function renderTiers() {
  const ev = state.currentEvent;
  if (!ev) return;
  const el = document.getElementById("modal-ticket-types");
  el.innerHTML = ev.tiers
    .map((t, i) => {
      const soldOut = Number.isFinite(t.remaining) && t.remaining < 1;
      return `
    <div class="ticket-type ${i === state.currentTierIdx ? "selected" : ""} ${soldOut ? "disabled" : ""}" onclick="selectTier(${i})">
      <div>
        <div class="ticket-type-name">${escapeHtml(t.name)}</div>
        <div class="ticket-type-desc">${escapeHtml(t.desc || "")}</div>
      </div>
      <div class="ticket-type-price">${formatRub(t.price)}</div>
    </div>
  `;
    })
    .join("");
}

function selectTier(i) {
  const ev = state.currentEvent;
  if (!ev || !ev.tiers[i]) return;
  const t = ev.tiers[i];
  if (Number.isFinite(t.remaining) && t.remaining < 1) return;
  state.currentTierIdx = i;
  renderTiers();
  updateSummary();
}

function changeQty(d) {
  const ev = state.currentEvent;
  const tier = ev?.tiers[state.currentTierIdx];
  const maxByStock = Number.isFinite(tier?.remaining) ? Math.min(10, Math.max(1, tier.remaining)) : 10;
  state.qty = clamp(state.qty + d, 1, maxByStock);
  document.getElementById("qty-display").textContent = String(state.qty);
  updateSummary();
}

function updateSummary() {
  const ev = state.currentEvent;
  if (!ev) return;
  const tier = ev.tiers[state.currentTierIdx];
  const price = Number(tier?.price || 0);
  const sub = price * state.qty;
  const fee = Math.round(sub * 0.05);
  const total = sub + fee;
  document.getElementById("sum-tickets").textContent = formatRub(sub);
  document.getElementById("sum-fee").textContent = formatRub(fee);
  document.getElementById("sum-total").textContent = formatRub(total);
}

async function confirmBooking() {
  const ev = state.currentEvent;
  if (!ev) return;
  if (!supabaseReady()) return showToast("Supabase", "Настрой EVENTIX_SUPABASE_URL и EVENTIX_SUPABASE_ANON_KEY в .env");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    showToast("Нужен аккаунт", "Войди или зарегистрируйся — билет сохранится в базе.");
    return;
  }
  const tier = ev.tiers[state.currentTierIdx];
  const tid = tier?.ticketTypeId;
  const buyerName = String(document.getElementById("buyer-name")?.value || "").trim();
  const buyerEmail = String(document.getElementById("buyer-email")?.value || "").trim();
  const buyerPhoneRaw = String(document.getElementById("buyer-phone")?.value || "").trim();
  const buyerPhone = normalizePhoneDigits(buyerPhoneRaw);
  if (buyerName.length < 3) return showToast("Ошибка", "Укажи имя и фамилию (минимум 3 символа)");
  if (!isValidEmail(buyerEmail)) return showToast("Ошибка", "Укажи корректный email");
  if (buyerPhoneRaw && buyerPhone.length < 10) return showToast("Ошибка", "Телефон должен содержать минимум 10 цифр");
  if (!tid) {
    showToast("Покупка недоступна", "У события нет типов билетов в Supabase.");
    return;
  }
  const rem = Number(tier.remaining);
  if (Number.isFinite(rem) && rem < state.qty) {
    showToast("Мало билетов", `Осталось ${rem}`);
    return;
  }
  const { error } = await supabase.rpc("purchase_tickets", { p_ticket_type_id: tid, p_qty: state.qty });
  if (error) {
    showToast("Оплата", error.message);
    return;
  }
  closeModal();
  showToast("Билет оформлен", "Списано в базе; смотри «Мои билеты».");
  await reloadEvents();
  await loadMyTickets();
}

function updatePreview() {
  const title = document.getElementById("ev-title").value || "Название события";
  const cat = document.getElementById("ev-category").value;
  const venue = document.getElementById("ev-venue").value || "Место не указано";
  const date = document.getElementById("ev-date").value;
  const price = document.getElementById("t1-price").value;
  const qty1 = parseInt(document.getElementById("t1-qty").value, 10) || 0;
  const qty2 = parseInt(document.getElementById("t2-qty").value, 10) || 0;
  document.getElementById("prev-title").textContent = title;
  document.getElementById("prev-venue").textContent = venue;
  const prevCover = document.getElementById("prev-cover");
  if (state.draftCoverDataUrl) {
    prevCover.innerHTML = `<img alt="" src="${escapeHtmlAttr(state.draftCoverDataUrl)}" style="width:100%;height:100%;object-fit:cover;display:block" />`;
  } else {
    prevCover.textContent = catPreviewMap[cat] || "EVENT";
  }
  document.getElementById("prev-cat").textContent = catLabelMap[cat] || "Событие";
  document.getElementById("prev-date").textContent = date ? formatDateRu(date) : "дата не указана";
  document.getElementById("prev-price").textContent = price ? `от ₽ ${Number(price).toLocaleString("ru")}` : "цена не указана";
  document.getElementById("prev-seats").textContent = qty1 + qty2 ? `${qty1 + qty2} мест` : "наличие уточняется";
}

function wireCoverUpload() {
  const input = document.getElementById("ev-cover-file");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Файл не подходит", "Выбери изображение (PNG/JPG/WebP).");
      return;
    }
    state.draftCoverFile = file;
    const dataUrl = await readAsDataUrl(file);
    state.draftCoverDataUrl = dataUrl;
    const img = document.getElementById("ev-cover-preview");
    const wrap = document.getElementById("ev-cover-preview-wrap");
    if (img && wrap) {
      img.src = dataUrl;
      wrap.style.display = "block";
    }
    updatePreview();
  });
  const zone = document.querySelector(".upload-zone");
  if (!zone) return;
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag");
    try {
      input.files = e.dataTransfer.files;
    } catch {
      /* ignore */
    }
    input.dispatchEvent(new Event("change"));
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("File read failed"));
    fr.readAsDataURL(file);
  });
}

function formatDateRu(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function collectTicketTypeRows(eventId) {
  const rows = [];
  const add = (nameId, priceId, qtyId) => {
    const name = document.getElementById(nameId)?.value.trim();
    const price = parseInt(document.getElementById(priceId)?.value, 10);
    const qty = parseInt(document.getElementById(qtyId)?.value, 10);
    if (!name || !Number.isFinite(price) || !Number.isFinite(qty) || qty < 1) return;
    rows.push({
      event_id: eventId,
      name,
      price_rub: Math.trunc(price),
      total_qty: Math.trunc(qty),
      remaining_qty: Math.trunc(qty),
    });
  };
  add("t1-name", "t1-price", "t1-qty");
  add("t2-name", "t2-price", "t2-qty");
  add("t3-name", "t3-price", "t3-qty");
  return rows;
}

async function uploadCoverToSupabase(file) {
  if (!supabaseReady() || !file) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `events/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(COVERS_BUCKET).upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error("Не удалось получить URL обложки");
  return data.publicUrl;
}

async function publishEvent() {
  if (!supabaseReady()) return showToast("Supabase", "Настрой EVENTIX_SUPABASE_URL и EVENTIX_SUPABASE_ANON_KEY в .env");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return showToast("Нужен аккаунт", "Войди, чтобы опубликовать событие и билеты.");

  const title = document.getElementById("ev-title").value.trim();
  if (!title) return showToast("Ошибка", "Укажите название события");

  const cat = document.getElementById("ev-category").value;
  const description = document.getElementById("ev-desc")?.value.trim() || null;
  const venue = document.getElementById("ev-venue").value.trim() || null;
  const date = document.getElementById("ev-date").value;
  const time = document.getElementById("ev-time").value || "20:00";
  const contactEmail = String(document.getElementById("ev-email")?.value || "").trim();
  const contactPhoneRaw = String(document.getElementById("ev-phone")?.value || "").trim();
  const contactPhone = normalizePhoneDigits(contactPhoneRaw);
  if (!date) return showToast("Ошибка", "Укажите дату");
  if (!venue) return showToast("Ошибка", "Укажите место проведения");
  if (contactEmail && !isValidEmail(contactEmail)) return showToast("Ошибка", "Проверь email организатора");
  if (contactPhoneRaw && contactPhone.length < 10) return showToast("Ошибка", "Телефон организатора: минимум 10 цифр");

  const startsAtDate = new Date(`${date}T${time}:00`);
  if (Number.isNaN(startsAtDate.getTime())) return showToast("Ошибка", "Проверь дату и время");
  if (startsAtDate.getTime() <= Date.now()) return showToast("Ошибка", "Дата события должна быть в будущем");
  const starts_at = startsAtDate.toISOString();

  try {
    let cover_url = null;
    if (state.draftCoverFile) cover_url = await uploadCoverToSupabase(state.draftCoverFile);

    const { data, error } = await supabase
      .from("events")
      .insert([
        {
          title,
          description,
          category: cat,
          starts_at,
          venue_name: venue,
          venue_address: venue,
          city: null,
          cover_url,
        },
      ])
      .select()
      .single();
    if (error) throw error;

    const typeRows = collectTicketTypeRows(data.id);
    if (typeRows.length) {
      const { error: ttErr } = await supabase.from("ticket_types").insert(typeRows);
      if (ttErr) throw ttErr;
    }

    showToast("Событие опубликовано", `"${title}" в Supabase`);
    state.draftCoverFile = null;
    state.draftCoverDataUrl = "";
    const wrap = document.getElementById("ev-cover-preview-wrap");
    const finput = document.getElementById("ev-cover-file");
    if (wrap) wrap.style.display = "none";
    if (finput) finput.value = "";
    showPage("home", document.querySelectorAll(".nav-btn")[0]);
    await reloadEvents();
  } catch (e) {
    showToast("Ошибка", e?.message || String(e));
  }
}

async function loadMyTickets() {
  const el = document.getElementById("tickets-list");
  if (!el) return;
  if (!supabaseReady() || !state.user) {
    state.myTickets = [];
    updateTicketCount();
    el.innerHTML = `
      <div class="empty-state">
        <div style="font-size:16px;letter-spacing:.18em;font-weight:1000;color:rgba(234,240,255,.62)">TICKETS</div>
        <div class="empty-title">Войди в аккаунт</div>
        <div style="margin-top:6px">Билеты в базе видны только после входа.</div>
      </div>`;
    return;
  }
  const { data, error } = await supabase
    .from("tickets")
    .select(
      `
      id, code, status, issued_at,
      events ( title, starts_at ),
      ticket_types ( name, price_rub )
    `,
    )
    .order("issued_at", { ascending: false });
  if (error) {
    el.innerHTML = `<div class="hint">${escapeHtml(error.message)}</div>`;
    return;
  }
  state.myTickets = Array.isArray(data) ? data : [];
  updateTicketCount();
  renderTickets();
}

function renderTickets() {
  const el = document.getElementById("tickets-list");
  if (!el) return;
  if (!state.myTickets.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div style="font-size:16px;letter-spacing:.18em;font-weight:1000;color:rgba(234,240,255,.62)">TICKETS</div>
        <div class="empty-title">Пока нет билетов</div>
        <div style="margin-top:6px">Купи билет в афише — он появится здесь.</div>
        <button class="btn-primary" style="margin-top:16px" onclick="showPage('home',document.querySelectorAll('.nav-btn')[0])">Перейти в афишу</button>
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <div class="ticket-list">
      ${state.myTickets
        .map((t) => {
          const ev = t.events || {};
          const tt = t.ticket_types || {};
          const title = ev.title || "Событие";
          const when = ev.starts_at ? formatDateLongRu(ev.starts_at) : "скоро";
          return `
        <div class="ticket-item">
          <div class="ticket-emoji">${escapeHtml("TICKET")}</div>
          <div class="ticket-info">
            <div class="ticket-name">${escapeHtml(title)}</div>
            <div class="ticket-details">
              ${escapeHtml(when)} · ${escapeHtml(tt.name || "Билет")}
            </div>
            <div style="margin-top:6px;font-size:12px;color:rgba(234,240,255,.62)">Код: <strong style="color:rgba(234,240,255,.90)">${escapeHtml(
              t.code || "",
            )}</strong></div>
          </div>
          <div style="text-align:right">
            <span class="ticket-status status-active">${escapeHtml(t.status || "issued")}</span>
            <div style="margin-top:8px;font-family:var(--serif);font-size:18px;font-weight:900">${formatRub(tt.price_rub)}</div>
          </div>
          <div class="ticket-qr" role="button" tabindex="0"
            onclick="openQrModal('${escapeHtmlAttr(t.code || "")}')"
            onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); openQrModal('${escapeHtmlAttr(t.code || "")}'); }"
            aria-label="Открыть QR для сканирования">
            <img alt="QR билета" loading="lazy" src="${ticketQrUrl(t.code || "")}" style="width:46px;height:46px;border-radius:8px;display:block" />
          </div>
        </div>
      `;
        })
        .join("")}
    </div>
  `;
}

function openQrModal(code) {
  const c = String(code || "").trim();
  const modal = document.getElementById("qr-modal");
  const img = document.getElementById("qr-big-img");
  const label = document.getElementById("qr-big-code");
  if (!modal || !img) return;
  img.src = ticketQrUrl(c);
  if (label) label.innerHTML = c ? `Код: <code>${escapeHtml(c)}</code>` : "";
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeQrModal() {
  const modal = document.getElementById("qr-modal");
  const img = document.getElementById("qr-big-img");
  if (img) img.src = "";
  modal?.classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const qrOpen = document.getElementById("qr-modal")?.classList.contains("open");
  if (qrOpen) closeQrModal();
});

function updateTicketCount() {
  const cnt = document.getElementById("ticket-count");
  if (!cnt) return;
  const n = state.myTickets.length;
  if (n) {
    cnt.textContent = String(n);
    cnt.style.display = "inline";
  } else {
    cnt.style.display = "none";
  }
}

function showPage(name, btn) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("page-" + name)?.classList.add("active");
  if (btn && btn.classList.contains("nav-btn")) btn.classList.add("active");
  window.scrollTo(0, 0);
  if (name === "auth") showAuthTab("login");
  if (name === "tickets") loadMyTickets().catch(() => {});
}

function syncSourceUi() {
  const wrap = document.getElementById("tm-key-wrap");
  if (wrap) wrap.style.display = "none";
  const badge = document.getElementById("source-badge");
  if (badge) badge.textContent = "Supabase";
}

function updateSourceBadge(text) {
  const el = document.getElementById("source-status");
  if (!el) return;
  const ts = state.lastLoadedAt ? state.lastLoadedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
  el.textContent = ts ? `${text} · ${ts}` : text;
}

function showToast(msg, sub) {
  const text = document.getElementById("toast-text");
  if (text) text.innerHTML = escapeHtml(msg) + `<small>${escapeHtml(sub || "")}</small>`;
  const t = document.getElementById("toast");
  if (!t) return;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3800);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function normalizePhoneDigits(phoneRaw) {
  return String(phoneRaw || "").replace(/\D/g, "");
}

function ticketQrUrl(ticketCode) {
  const code = String(ticketCode || "").trim() || "eventix-empty-code";
  const payload = `EVENTIX:${code}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(payload)}`;
}

function formatRub(n) {
  const num = Number(n || 0);
  return "₽ " + num.toLocaleString("ru-RU");
}

function formatDateShortRu(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "скоро";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

function formatDateLongRu(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "скоро";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeHtmlAttr(s) {
  return escapeHtml(s).replaceAll("`", "&#096;");
}
