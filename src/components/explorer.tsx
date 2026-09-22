"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  MapPin,
  Map as MapIcon,
  Layers,
  LayoutGrid,
  ArrowUpRight,
  Search,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  House,
  Check,
  LocateFixed,
  Maximize,
  Plus,
  LogIn,
  ArrowLeft,
  ArrowRight,
  X,
  Info,
  HelpCircle,
  Users,
  CheckCheck,
  Globe,
  Compass,
  LoaderCircle,
  Copy,
  MessageSquare,
  ExternalLink,
  PanelLeftClose,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import Map from "./map";
import Manager from "./manager";
import { Location, SLS, Comment, seedLocations, seedSls } from "@/lib/data";
export type User = { id: string; name: string; email: string; role: string };
export async function api(body: unknown) {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}
function visitor() {
  let id = localStorage.getItem("geovit-visitor");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("geovit-visitor", id);
  }
  return id;
}
export default function Explorer({ locationId }: { locationId?: string }) {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>(
      locationId ? [] : seedLocations,
    ),
    [sls, setSls] = useState<SLS[]>(seedSls),
    [stats, setStats] = useState({ total: 24, visited: 8, sls: 4 });
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState<Location | null>(null),
    [comments, setComments] = useState<Comment[]>([]);
  const [user, setUser] = useState<User | null>(null),
    [dataMode, setDataMode] = useState<"loading" | "database" | "demo">(
      "loading",
    ),
    [loading, setLoading] = useState(false),
    [total, setTotal] = useState(24),
    [page, setPage] = useState(1);
  const [modal, setModal] = useState(""),
    [toast, setToast] = useState(""),
    [reset, setReset] = useState(0),
    [boundary, setBoundary] = useState(false),
    [layers, setLayers] = useState(false),
    [listView, setListView] = useState(false),
    [dataPanelOpen, setDataPanelOpen] = useState(false),
    [publicFiltersOpen, setPublicFiltersOpen] = useState(false),
    [center, setCenter] = useState<[number, number]>(),
    [userLocation, setUserLocation] = useState<[number, number] | null>(null),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [liveLocationUpdates, setLiveLocationUpdates] = useState<
      Record<string, "new" | "visited" | "updated">
    >({}),
    [liveCommentIds, setLiveCommentIds] = useState<string[]>([]);
  const locationsRef = useRef<Location[]>(locations);
  const commentsRef = useRef<Comment[]>(comments);
  const revisionRef = useRef<string | null>(null);
  const realtimeLocationRefreshRef = useRef(false);
  const realtimeCommentRefreshRef = useRef(false);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, page: String(page) });
        if (filter) params.set("sls", filter);
        if (status) params.set("status", status);
        if (locationId) params.set("id", locationId);
        const res = await fetch("/api/data?" + params, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error);
        if (realtimeLocationRefreshRef.current) {
          const before = new globalThis.Map(
            locationsRef.current.map((location) => [location.id, location]),
          );
          const updates: Record<string, "new" | "visited" | "updated"> = {};
          for (const location of data.locations as Location[]) {
            const previous = before.get(location.id);
            if (!previous) updates[location.id] = "new";
            else if (
              previous.status !== "visited" &&
              location.status === "visited"
            )
              updates[location.id] = "visited";
            else if (previous.visits !== location.visits)
              updates[location.id] = "updated";
          }
          if (Object.keys(updates).length) {
            setLiveLocationUpdates(updates);
            notify("Peta diperbarui dengan aktivitas terbaru.");
          }
          realtimeLocationRefreshRef.current = false;
        }
        locationsRef.current = data.locations;
        setLocations(data.locations);
        setSls(data.sls);
        setStats(data.stats);
        setTotal(data.total);
        setDataMode(data.demo ? "demo" : "database");
        setUser(data.user);
        if (locationId) {
          setSelected(data.locations[0] || null);
          if (data.locations[0])
            setCenter([
              data.locations[0].latitude,
              data.locations[0].longitude,
            ]);
          setComments(data.comments);
          commentsRef.current = data.comments;
        }
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") notify(e.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, filter, status, page, reload, locationId, notify]);
  const choose = useCallback((loc: Location) => {
    setSelected(loc);
    setCenter([loc.latitude, loc.longitude]);
    setComments([]);
  }, []);
  useEffect(() => {
    if (!selected?.id) return;
    const controller = new AbortController();
    fetch("/api/data?id=" + encodeURIComponent(selected.id), {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        const nextComments = d.comments || [];
        if (realtimeCommentRefreshRef.current) {
          const known = new Set(commentsRef.current.map((comment) => comment.id));
          const fresh = nextComments
            .filter((comment: Comment) => !known.has(comment.id))
            .map((comment: Comment) => comment.id);
          if (fresh.length) setLiveCommentIds(fresh);
          realtimeCommentRefreshRef.current = false;
        }
        commentsRef.current = nextComments;
        setComments(nextComments);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [selected?.id, reload]);
  useEffect(() => {
    let disposed = false;
    const checkRevision = async () => {
      if (disposed || document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/data?revision=1", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok || !data.revision) return;
        if (revisionRef.current && revisionRef.current !== data.revision) {
          realtimeLocationRefreshRef.current = true;
          if (selected?.id) realtimeCommentRefreshRef.current = true;
          setReload((value) => value + 1);
        }
        revisionRef.current = data.revision;
      } catch {
        // Pembaruan berkala bersifat tambahan; tampilan yang ada tetap digunakan.
      }
    };
    const onVisibilityChange = () => checkRevision();
    checkRevision();
    const interval = window.setInterval(checkRevision, 8000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [selected?.id]);
  useEffect(() => {
    if (!Object.keys(liveLocationUpdates).length && !liveCommentIds.length)
      return;
    const timer = window.setTimeout(() => {
      setLiveLocationUpdates({});
      setLiveCommentIds([]);
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [liveLocationUpdates, liveCommentIds]);
  const visible = useMemo(
    () =>
      locations.filter(
        (l) =>
          (!filter || l.sls_id === filter) &&
          (!status || l.status === status) &&
          (!query ||
            `${l.title} ${l.address}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [locations, filter, status, query],
  );
  const liveLocationIds = useMemo(
    () => Object.keys(liveLocationUpdates),
    [liveLocationUpdates],
  );
  const changeFilter = (value: string) => {
    setFilter(value);
    setPage(1);
    setSelected(null);
  };
  const refresh = () => setReload((v) => v + 1);
  async function visit() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api({
        action: "visit",
        location_id: selected.id,
        visitor_id: visitor(),
      });
      realtimeLocationRefreshRef.current = true;
      setSelected({ ...selected, status: "visited" });
      notify("Kunjungan Anda berhasil dicatat. Terima kasih!");
      refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function comment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await api({
        action: "comment",
        location_id: selected!.id,
        visitor_id: visitor(),
        name: data.get("name"),
        comment: data.get("comment"),
      });
      realtimeCommentRefreshRef.current = true;
      notify("Komentar berhasil ditampilkan.");
      form.reset();
      refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !modal
      ) {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>(".search-field input")
          ?.focus();
      }
      if (event.key === "Escape") {
        setModal("");
        setSelected(null);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>(".modal");
    const selector =
      "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)";
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(selector) || []);
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  const doLocate = () => {
    if (!navigator.geolocation) {
      notify("Browser tidak mendukung lokasi perangkat.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const position: [number, number] = [
          p.coords.latitude,
          p.coords.longitude,
        ];
        setUserLocation(position);
        setCenter(position);
        notify("Peta dipusatkan ke lokasi Anda.");
      },
      () => notify("Lokasi tidak tersedia. Izinkan akses lokasi pada browser."),
      { timeout: 10000 },
    );
  };
  const selectedSls = sls.find((s) => s.id === selected?.sls_id);
  const publicView = !user;
  return (
    <div
      className={"app-shell " + (publicView ? "public-view" : "manager-view")}
    >
      <aside className="rail">
        <Link className="brand-symbol" href="/" aria-label="Beranda Geovit">
          <MapPin size={26} strokeWidth={2.3} />
          <span />
        </Link>
        <div className="rail-nav">
          <button
            className={!listView ? "rail-button active" : "rail-button"}
            title="Peta lokasi"
            onClick={() => {
              setListView(false);
              setModal("");
            }}
          >
            <MapIcon size={22} />
          </button>
          <button
            className={listView ? "rail-button active" : "rail-button"}
            title="Daftar lokasi"
            onClick={() => setListView(true)}
          >
            <LayoutGrid size={21} />
          </button>
          <button
            className="rail-button"
            title="Wilayah SLS"
            onClick={() => setModal("regions")}
          >
            <Layers size={22} />
          </button>
          <div className="rail-divider" />
          <button
            className="rail-button"
            title="Panduan penggunaan"
            onClick={() => setModal("help")}
          >
            <HelpCircle size={21} />
          </button>
        </div>
        <div className="rail-bottom">
          <span className="live-dot" />
          <button
            className="avatar"
            title={user?.name || "Masuk pengelola"}
            onClick={() => setModal(user ? "manage" : "login")}
          >
            {user ? user.name.slice(0, 2).toUpperCase() : <Users size={18} />}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          {publicView ? (
            <Link href="/" className="public-logo" aria-label="Geovit">
              <MapIcon size={22} />
            </Link>
          ) : (
            <Link href="/" className="wordmark">
              geovit<span> / </span>
              <small>Pemetaan Sensus</small>
            </Link>
          )}
          {publicView && (
            <div
              className={
                "public-map-toolbar " +
                (publicFiltersOpen ? "public-filters-open" : "")
              }
            >
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Cari lokasi atau alamat"
                  placeholder="Cari nama lokasi atau alamat…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
                {query && (
                  <button
                    aria-label="Hapus pencarian"
                    onClick={() => setQuery("")}
                  >
                    <X size={15} />
                  </button>
                )}
                <kbd>/</kbd>
              </div>
              <button
                className="public-filter-toggle"
                aria-label="Buka filter SLS"
                aria-expanded={publicFiltersOpen}
                onClick={() => setPublicFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal size={16} />
                <span>Filter</span>
              </button>
              <button
                className="public-data-toggle"
                aria-label="Buka daftar lokasi"
                title="Daftar lokasi"
                aria-expanded={dataPanelOpen}
                onClick={() => setDataPanelOpen((open) => !open)}
              >
                <LayoutGrid size={15} />
                {dataPanelOpen ? "Tutup data" : `Data (${total})`}
              </button>
              <label
                className={
                  "select-field public-sls-filter " +
                  (!publicFiltersOpen ? "public-filter-hidden" : "")
                }
              >
                <Layers size={17} />
                <select
                  aria-label="Filter SLS"
                  value={filter}
                  onChange={(e) => changeFilter(e.target.value)}
                >
                  <option value="">Semua SLS</option>
                  {sls.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>
            </div>
          )}
          <div className="header-right">
            <span className="public-label">
              <span />
              Akses publik
            </span>
            <span className="top-divider" />
            <button
              className="login-button"
              onClick={() => setModal(user ? "manage" : "login")}
            >
              {user ? <Users size={16} /> : <LogIn size={16} />}
              <span>{user ? user.name : "Masuk Pengelola"}</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <div className="eyebrow">
                <span /> DATA LAPANGAN, LEBIH TERHUBUNG
              </div>
              <h1>
                Jelajahi lokasi sensus<span>.</span>
              </h1>
              <p>
                Temukan lokasi, kenali wilayah, dan pantau kunjungan dalam satu
                peta.
              </p>
            </div>
            <button
              className="area-chip"
              onClick={() => {
                setCenter([-6.184, 106.837]);
                setReset((v) => v + 1);
              }}
            >
              <span className="area-icon">
                <MapPin size={19} />
              </span>
              <span>
                <small>WILAYAH PEMETAAN</small>
                <strong>Menteng, Jakarta Pusat</strong>
              </span>
              <ChevronDown size={16} />
            </button>
          </div>
          <section className="stats-row" aria-label="Ringkasan sensus">
            <div className="stat">
              <span className="stat-icon green">
                <MapPin size={21} />
              </span>
              <div>
                <span>Total lokasi</span>
                <strong>
                  {stats.total}
                  <small>lokasi terpetakan</small>
                </strong>
              </div>
              <span className="stat-trend">
                <ArrowUpRight size={15} /> Terpetakan
              </span>
            </div>
            <div className="stat">
              <span className="stat-icon blue">
                <Layers size={21} />
              </span>
              <div>
                <span>Wilayah SLS</span>
                <strong>
                  {stats.sls}
                  <small>satuan lingkungan</small>
                </strong>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon mint">
                <CheckCheck size={21} />
              </span>
              <div>
                <span>Sudah dikunjungi</span>
                <strong>
                  {stats.visited}
                  <small>dari {stats.total} lokasi</small>
                </strong>
              </div>
              <div
                className="progress-ring"
                style={
                  {
                    "--progress": `${stats.total ? (stats.visited / stats.total) * 100 : 0}%`,
                  } as React.CSSProperties
                }
              >
                <span>
                  {stats.total
                    ? Math.round((stats.visited / stats.total) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon orange">
                <Compass size={21} />
              </span>
              <div>
                <span>Belum dikunjungi</span>
                <strong>
                  {stats.total - stats.visited}
                  <small>siap untuk dijelajahi</small>
                </strong>
              </div>
            </div>
          </section>
          <section className="explore-section">
            {!publicView && (
              <div className="explore-heading">
                <div>
                  <h2>Peta persebaran lokasi</h2>
                  <span>Setiap titik, bagian dari cerita wilayah kita.</span>
                </div>
                <div className="view-toggle">
                  <button
                    className={!listView ? "selected" : ""}
                    onClick={() => setListView(false)}
                  >
                    <MapIcon size={15} />
                    Peta
                  </button>
                  <button
                    className={listView ? "selected" : ""}
                    onClick={() => setListView(true)}
                  >
                    <LayoutGrid size={15} />
                    Daftar
                  </button>
                </div>
              </div>
            )}
            {!publicView && <div className="filterbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Cari lokasi atau alamat"
                  placeholder="Cari nama lokasi atau alamat…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
                {query && (
                  <button
                    aria-label="Hapus pencarian"
                    onClick={() => setQuery("")}
                  >
                    <X size={15} />
                  </button>
                )}
                <kbd>/</kbd>
              </div>
              {publicView && (
                <>
                  <button
                    className="public-filter-toggle"
                    aria-label="Buka filter SLS"
                    aria-expanded={publicFiltersOpen}
                    onClick={() => setPublicFiltersOpen((open) => !open)}
                  >
                    <SlidersHorizontal size={16} />
                    <span>Filter</span>
                  </button>
                  <button
                    className="public-data-toggle"
                    aria-expanded={dataPanelOpen}
                    onClick={() => setDataPanelOpen((open) => !open)}
                  >
                    <LayoutGrid size={15} />
                    {dataPanelOpen ? "Tutup data" : `Data (${total})`}
                  </button>
                </>
              )}
              <label
                className={
                  "select-field " +
                  (publicView ? "public-sls-filter " : "") +
                  (publicView && !publicFiltersOpen ? "public-filter-hidden" : "")
                }
              >
                <Layers size={17} />
                <select
                  aria-label="Filter SLS"
                  value={filter}
                  onChange={(e) => changeFilter(e.target.value)}
                >
                  <option value="">Semua SLS</option>
                  {sls.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>
              <label className="select-field status-select">
                <SlidersHorizontal size={17} />
                <select
                  aria-label="Status kunjungan"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Semua status</option>
                  <option value="visited">Sudah dikunjungi</option>
                  <option value="unvisited">Belum dikunjungi</option>
                </select>
                <ChevronDown size={15} />
              </label>
              <div className="filter-spacer" />
              {user && (
                <button className="add-button" onClick={() => setModal("edit")}>
                  <Plus size={17} />
                  Tambah lokasi
                </button>
              )}
            </div>}
            <div
              className={
                "map-workspace " +
                (!publicView && listView ? "list-mode " : "") +
                (publicView && dataPanelOpen ? "public-list-open" : "")
              }
            >
              <aside
                className="location-panel"
                aria-hidden={publicView && !dataPanelOpen}
                inert={publicView && !dataPanelOpen}
              >
                <div className="list-heading">
                  <div>
                    <h3>
                      Daftar lokasi <span>{total}</span>
                    </h3>
                    <p>
                      {filter
                        ? sls.find((s) => s.id === filter)?.name
                        : "Semua wilayah SLS"}{" "}
                      · Kecamatan Menteng
                    </p>
                  </div>
                  {loading ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <button
                      title={
                        publicView
                          ? "Tutup daftar lokasi"
                          : "Tampilkan semua titik"
                      }
                      onClick={() =>
                        publicView
                          ? setDataPanelOpen(false)
                          : setReset((v) => v + 1)
                      }
                    >
                      <PanelLeftClose size={17} />
                    </button>
                  )}
                </div>
                <div className="location-list">
                  {visible.length === 0 ? (
                    <div className="empty-state">
                      <Search size={32} />
                      <h3>Lokasi tidak ditemukan</h3>
                      <p>Coba kata kunci atau filter lainnya.</p>
                      <button
                        onClick={() => {
                          setQuery("");
                          setFilter("");
                          setStatus("");
                        }}
                      >
                        Reset filter
                      </button>
                    </div>
                  ) : (
                    visible.map((loc) => {
                      const region = sls.find((s) => s.id === loc.sls_id);
                      const liveUpdate = liveLocationUpdates[loc.id];
                      return (
                        <button
                          className={
                            "location-card " +
                            (selected?.id === loc.id ? "is-selected " : "") +
                            (liveUpdate ? "is-live-update" : "")
                          }
                          key={loc.id}
                          onClick={() => choose(loc)}
                        >
                          <div className="location-card-top">
                            <span
                              className="house-icon"
                              style={{
                                color: region?.marker_color,
                                background: `${region?.marker_color}13`,
                              }}
                            >
                              <House size={20} />
                            </span>
                            <span className="location-title">
                              <strong>{loc.title}</strong>
                              <span>{loc.address}</span>
                            </span>
                            <ChevronRight className="card-chevron" size={16} />
                          </div>
                          <div className="location-card-bottom">
                            {liveUpdate && (
                              <span className="live-update-badge">
                                {liveUpdate === "new"
                                  ? "Lokasi baru"
                                  : liveUpdate === "visited"
                                    ? "Baru dikunjungi"
                                    : "Diperbarui"}
                              </span>
                            )}
                            <span
                              className="sls-tag"
                              style={{
                                color: region?.marker_color,
                                background: `${region?.marker_color}12`,
                              }}
                            >
                              <i style={{ background: region?.marker_color }} />
                              {region?.code}
                            </span>
                            <span
                              className={
                                "visit-state " +
                                (loc.status === "visited" ? "visited" : "")
                              }
                            >
                              {loc.status === "visited" ? (
                                <CheckCircle2 size={11} />
                              ) : (
                                <span className="tiny-circle" />
                              )}
                              {loc.status === "visited"
                                ? "Sudah dikunjungi"
                                : "Belum dikunjungi"}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="list-footer">
                  <span>
                    Menampilkan {visible.length} dari {total} lokasi
                  </span>
                  {total > 100 ? (
                    <div>
                      <button
                        aria-label="Halaman sebelumnya"
                        disabled={page === 1}
                        onClick={() => setPage((v) => v - 1)}
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <button
                        aria-label="Halaman berikutnya"
                        disabled={page * 100 >= total}
                        onClick={() => setPage((v) => v + 1)}
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <span className="list-footer-dot" />
                  )}
                </div>
              </aside>
              <div className="map-panel">
                <Map
                  markers={visible}
                  sls={sls}
                  onSelect={choose}
                  selected={selected?.id}
                  liveLocationIds={liveLocationIds}
                  center={center}
                  userLocation={userLocation}
                  resetKey={reset}
                  boundaries={boundary}
                />
                <div className="map-location-chip">
                  <span className="live-dot" />
                  <span>Menteng, Jakarta Pusat</span>
                  <span className="chip-divider" />
                  <strong>{visible.length} lokasi</strong>
                </div>
                <div className="map-extra-controls">
                  <button title="Lokasi saya" onClick={doLocate}>
                    <LocateFixed size={19} />
                  </button>
                  {publicView && (
                    <button
                      title={
                        boundary
                          ? "Sembunyikan poligon SLS"
                          : "Tampilkan poligon SLS"
                      }
                      aria-label={
                        boundary
                          ? "Sembunyikan poligon SLS"
                          : "Tampilkan poligon SLS"
                      }
                      aria-pressed={boundary}
                      className={boundary ? "control-active" : ""}
                      onClick={() => setBoundary((value) => !value)}
                    >
                      <Layers size={18} />
                    </button>
                  )}
                  {user && (
                    <>
                      <button
                        title="Sesuaikan tampilan peta"
                        onClick={() => setReset((v) => v + 1)}
                      >
                        <Maximize size={18} />
                      </button>
                      <button
                        title="Lapisan peta"
                        className={layers ? "control-active" : ""}
                        onClick={() => setLayers((v) => !v)}
                      >
                        <Layers size={18} />
                      </button>
                    </>
                  )}
                </div>
                {user && layers && (
                  <div className="layers-popover">
                    <strong>Tampilan peta</strong>
                    <label>
                      <input
                        type="checkbox"
                        checked={boundary}
                        onChange={(e) => setBoundary(e.target.checked)}
                      />{" "}
                      Tampilkan poligon SLS
                    </label>
                    <small>Gunakan batas yang sudah disimpan untuk tiap SLS.</small>
                  </div>
                )}
                <div className="map-legend">
                  <span>WILAYAH SLS</span>
                  {sls.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => changeFilter(filter === s.id ? "" : s.id)}
                      className={filter === s.id ? "legend-active" : ""}
                    >
                      <i style={{ background: s.marker_color }} />
                      {s.code}
                    </button>
                  ))}
                </div>
                <div className="map-hint">
                  <Info size={13} />
                  Klik pin untuk melihat detail lokasi
                </div>
              </div>
              {selected && (
                <section className="detail-panel">
                  <div className="detail-top">
                    <span>DETAIL LOKASI</span>
                    <button
                      title="Tutup detail"
                      onClick={() => {
                        if (locationId) router.push("/");
                        else setSelected(null);
                      }}
                    >
                      <X size={19} />
                    </button>
                  </div>
                  {selected.image_url ? (
                    <Image
                      unoptimized
                      width={700}
                      height={320}
                      className="detail-image"
                      src={selected.image_url}
                      alt={selected.title}
                    />
                  ) : (
                    <div className="detail-illustration">
                      <div className="illustration-orbit" />
                      <House size={55} strokeWidth={1.1} />
                      <span>Lokasi sensus · {selectedSls?.name}</span>
                    </div>
                  )}
                  <div className="detail-body">
                    <span
                      className="sls-tag"
                      style={{ color: selectedSls?.marker_color }}
                    >
                      <i style={{ background: selectedSls?.marker_color }} />
                      {selectedSls?.code} · {selectedSls?.name}
                    </span>
                    <h2>{selected.title}</h2>
                    <p className="address-line">
                      <MapPin size={15} />
                      {selected.address}
                    </p>
                    <p>{selected.description}</p>
                    <div className="coordinate-box">
                      <div>
                        <small>LATITUDE</small>
                        <strong>{selected.latitude.toFixed(6)}</strong>
                      </div>
                      <div>
                        <small>LONGITUDE</small>
                        <strong>{selected.longitude.toFixed(6)}</strong>
                      </div>
                      <button
                        title="Salin koordinat"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(
                              `${selected.latitude}, ${selected.longitude}`,
                            )
                            .then(() => notify("Koordinat disalin."))
                            .catch(() =>
                              notify("Koordinat tidak dapat disalin."),
                            )
                        }
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                    <button
                      className="primary full"
                      disabled={busy}
                      onClick={visit}
                    >
                      <Check size={17} />
                      {selected.status === "visited"
                        ? "Catat kunjungan saya"
                        : "Tandai sudah dikunjungi"}
                    </button>
                    <span className="detail-note">
                      Satu kunjungan per browser. Tanpa perlu login.
                    </span>
                    <div className="detail-actions">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selected.latitude},${selected.longitude}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin size={14} />
                        Rute Google Maps
                      </a>
                      <Link href={"/location/" + selected.id}>
                        <ExternalLink size={14} />
                        Buka halaman detail
                      </Link>
                      {user && (
                        <button onClick={() => setModal("edit-selected")}>
                          Edit lokasi
                        </button>
                      )}
                    </div>
                    <div className="comments-section">
                      <h3>
                        <MessageSquare size={17} />
                        Komentar <span>{comments.length}</span>
                      </h3>
                      {comments.map((c) => (
                        <div
                          className={
                            "comment " +
                            (liveCommentIds.includes(c.id)
                              ? "is-live-update"
                              : "")
                          }
                          key={c.id}
                        >
                          <strong>{c.name}</strong>
                          {liveCommentIds.includes(c.id) && (
                            <span className="live-update-badge">Baru</span>
                          )}
                          <small>
                            {new Date(c.created_at).toLocaleDateString("id-ID")}
                          </small>
                          <p>{c.comment}</p>
                        </div>
                      ))}
                      {!comments.length && (
                        <p className="muted">
                          Belum ada komentar. Bagikan informasi lapangan Anda.
                        </p>
                      )}
                      <form onSubmit={comment}>
                        <label>
                          Nama
                          <input
                            name="name"
                            placeholder="Nama Anda"
                            required
                            minLength={2}
                            maxLength={80}
                          />
                        </label>
                        <label>
                          Komentar
                          <textarea
                            name="comment"
                            placeholder="Tulis informasi tentang lokasi ini…"
                            required
                            minLength={3}
                            maxLength={2000}
                          />
                        </label>
                        <button className="secondary full" disabled={busy}>
                          Kirim komentar
                          <ArrowRight size={15} />
                        </button>
                        <small>
                          Komentar langsung tampil setelah dikirim.
                        </small>
                      </form>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
          <footer className="page-footer">
            <span>
              <Globe size={13} /> Dibuat untuk pendataan yang lebih baik.
            </span>
            <span>
              {dataMode === "demo"
                ? "Mode contoh · Data ilustrasi"
                : dataMode === "loading"
                  ? "Memeriksa koneksi data…"
                  : "Data sensus terhubung"}
              <i /> Didukung OpenStreetMap <ArrowUpRight size={12} />
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button aria-label="Tutup pemberitahuan" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal("")}>
          <section
            className={
              "modal " +
              (["edit", "edit-selected", "manage", "import"].includes(modal)
                ? "modal-wide"
                : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label="Dialog Geovit"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Tutup dialog"
              onClick={() => setModal("")}
            >
              <X size={21} />
            </button>
            {modal === "login" && (
              <>
                <span className="modal-icon">
                  <MapPin size={26} />
                </span>
                <h2>Selamat datang kembali.</h2>
                <p>Masuk untuk mengelola lokasi dan data sensus.</p>
                {dataMode === "demo" && (
                  <div className="info-box">
                    <Info size={18} />
                    <span>
                      Mode contoh aktif. Login pengelola tersedia setelah
                      PostgreSQL dan akun admin dikonfigurasi.
                    </span>
                  </div>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    const data = new FormData(e.currentTarget);
                    try {
                      const result = await signIn("credentials", {
                        email: data.get("email"),
                        password: data.get("password"),
                        redirect: false,
                      });
                      if (result?.error)
                        notify("Email atau kata sandi tidak sesuai.");
                      else {
                        setModal("");
                        refresh();
                        notify("Berhasil masuk.");
                      }
                    } catch {
                      notify(
                        "Login belum tersedia. Periksa konfigurasi server.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Email
                    <input
                      type="email"
                      name="email"
                      placeholder="nama@instansi.go.id"
                      required
                    />
                  </label>
                  <label>
                    Kata sandi
                    <input
                      type="password"
                      name="password"
                      placeholder="Masukkan kata sandi"
                      required
                    />
                  </label>
                  <button
                    disabled={busy || dataMode !== "database"}
                    className="primary full"
                  >
                    {busy ? "Memproses…" : "Masuk Pengelola"}
                    <ArrowRight size={17} />
                  </button>
                </form>
                <div className="login-footer">
                  <Globe size={14} />
                  Pengunjung dapat menjelajahi peta tanpa login.
                </div>
              </>
            )}
            {modal === "help" && (
              <>
                <span className="modal-icon">
                  <Compass size={26} />
                </span>
                <h2>Mengenal wilayah, satu titik.</h2>
                <p>
                  Geovit membantu Anda menemukan dan mendata lokasi sensus
                  berdasarkan Satuan Lingkungan Setempat (SLS).
                </p>
                <div className="help-steps">
                  <div>
                    <span>01</span>
                    <section>
                      <h3>Temukan lokasi</h3>
                      <p>
                        Cari nama atau alamat, lalu pilih SLS dan status
                        kunjungan.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>02</span>
                    <section>
                      <h3>Jelajahi peta</h3>
                      <p>
                        Geser dan perbesar peta. Klik pin atau kartu lokasi
                        untuk melihat detail.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>03</span>
                    <section>
                      <h3>Bagikan perkembangan</h3>
                      <p>
                        Catat kunjungan dan tulis komentar tanpa login. Komentar
                        ditinjau editor sebelum tampil.
                      </p>
                    </section>
                  </div>
                </div>
                <button className="primary full" onClick={() => setModal("")}>
                  Mulai jelajahi
                  <ArrowRight size={17} />
                </button>
              </>
            )}
            {modal === "regions" && (
              <>
                <span className="modal-icon">
                  <Layers size={26} />
                </span>
                <h2>Wilayah SLS</h2>
                <p>Satuan Lingkungan Setempat di wilayah pemetaan.</p>
                <div className="region-list">
                  {sls.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        changeFilter(s.id);
                        setModal("");
                      }}
                    >
                      <span
                        className="region-dot"
                        style={{ background: s.marker_color }}
                      />
                      <span>
                        <strong>
                          {s.code} · {s.name}
                        </strong>
                        <small>{s.description}</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {["edit", "edit-selected", "manage", "import"].includes(modal) &&
              user && (
                <Manager
                  mode={modal}
                  user={user}
                  sls={sls}
                  locations={locations}
                  location={modal === "edit-selected" ? selected : null}
                  notify={notify}
                  onDone={() => {
                    setModal("");
                    setSelected(null);
                    if (locationId) router.push("/");
                    refresh();
                  }}
                  onRefresh={refresh}
                  onSignOut={() =>
                    signOut({ redirect: false }).then(() => {
                      setUser(null);
                      setModal("");
                      refresh();
                    })
                  }
                />
              )}
          </section>
        </div>
      )}
    </div>
  );
}
