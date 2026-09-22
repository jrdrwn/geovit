"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Comment, Location, SLS } from "@/lib/data";
import { locationInput } from "@/lib/validation";
import {
    Check,
    FileSpreadsheet,
    Info,
    LoaderCircle,
    LocateFixed,
    LogOut,
    MapPin,
    Plus,
    Trash2,
    Upload,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, User } from "./explorer";
import Map from "./map";
const empty = {
  title: "",
  sls_id: "",
  address: "",
  description: "",
  latitude: -6.184,
  longitude: 106.837,
  status: "unvisited",
  image_url: "",
};
export default function Manager({
  mode,
  user,
  sls,
  locations,
  location,
  notify,
  onDone,
  onRefresh,
  onSignOut,
  onCreated,
  onSlsChange,
}: {
  mode: string;
  user: User;
  sls: SLS[];
  locations: Location[];
  location: Location | null;
  notify: (s: string) => void;
  onDone: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onCreated: (location: Location) => void;
  onSlsChange: (region: SLS) => void;
}) {
  const [tab, setTab] = useState(mode === "manage" ? "comments" : "location"),
    [form, setForm] = useState<typeof empty & Partial<Location>>({
      ...empty,
      ...location,
      sls_id: location?.sls_id || sls[0]?.id || "",
    }),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [locationAccuracy, setLocationAccuracy] = useState<number | null>(null),
    [picking, setPicking] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const [moderation, setModeration] = useState<Comment[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [managedLocations, setManagedLocations] = useState<Location[]>(locations),
    [rows, setRows] = useState<
      { data: Record<string, unknown>; error: string; line: number }[]
    >([]),
    [importName, setImportName] = useState(""),
    [slsEdit, setSlsEdit] = useState<SLS | null>(null),
    [commentToDelete, setCommentToDelete] = useState<string | null>(null),
    [slsToDelete, setSlsToDelete] = useState<SLS | null>(null),
    [locationToDelete, setLocationToDelete] = useState<Location | null>(null),
    [locationSearch, setLocationSearch] = useState(""),
    [managementLoading, setManagementLoading] = useState(mode === "manage"),
    [sessionSls, setSessionSls] = useState<SLS[]>([]),
    [slsUserLocation, setSlsUserLocation] = useState<
      [number, number] | null
    >(null);
  const [polygon, setPolygon] = useState<[number, number][]>(
    slsEdit?.boundary || [],
  );
  const locationRequest = useRef(0);
  useEffect(
    () => () => {
      locationRequest.current += 1;
    },
    [],
  );

  function handleCurrentLocation() {
    if (locating || busy) return;
    if (!window.isSecureContext) {
      notify("Lokasi perangkat memerlukan HTTPS atau localhost.");
      return;
    }
    if (!navigator.geolocation) {
      notify("Browser ini tidak mendukung lokasi perangkat.");
      return;
    }
    const request = ++locationRequest.current;
    setLocating(true);
    setLocationAccuracy(null);
    setPicking(false);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== locationRequest.current) return;
        setForm((current) => ({
          ...current,
          latitude: Number(coords.latitude.toFixed(6)),
          longitude: Number(coords.longitude.toFixed(6)),
        }));
        setLocationAccuracy(Math.ceil(coords.accuracy));
        setLocating(false);
        notify(
          "Koordinat lokasi saat ini berhasil diisi. Periksa pin sebelum menyimpan.",
        );
      },
      (error) => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        notify(
          error.code === 1
            ? "Izin lokasi ditolak. Izinkan akses lokasi di browser lalu coba lagi."
            : error.code === 3
              ? "Pencarian lokasi terlalu lama. Coba lagi di area dengan sinyal lebih baik."
              : "Lokasi belum tersedia. Aktifkan layanan lokasi perangkat lalu coba lagi.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }
  const load = async () => {
    setManagementLoading(true);
    try {
      const response = await fetch("/api/data?manage=1");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memuat data.");
      setModeration(data.comments || []);
      setUsers(data.users || []);
      setManagedLocations(data.locations || locations);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Data pengelolaan tidak dapat dimuat.",
      );
    } finally {
      setManagementLoading(false);
    }
  };
  useEffect(() => {
    if (mode !== "manage") return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const center = useMemo<[number, number]>(
    () => [Number(form.latitude), Number(form.longitude)],
    [form.latitude, form.longitude],
  );
  const coordinatesValid =
    Number.isFinite(center[0]) &&
    Number.isFinite(center[1]) &&
    Math.abs(center[0]) <= 90 &&
    Math.abs(center[1]) <= 180;
  const markers = useMemo(
    () =>
      coordinatesValid
        ? [
            {
              ...form,
              id: form.id || "preview",
              latitude: center[0],
              longitude: center[1],
              visits: 0,
            },
          ]
        : [],
    [form, center, coordinatesValid],
  );
  const visibleManagedLocations = useMemo(() => {
    const needle = locationSearch.trim().toLowerCase();
    if (!needle) return managedLocations;
    return managedLocations.filter((item) =>
      `${item.title} ${item.address}`.toLowerCase().includes(needle),
    );
  }, [managedLocations, locationSearch]);
  const availableSls = useMemo(() => {
    const next = new globalThis.Map(sls.map((region) => [region.id, region]));
    for (const region of sessionSls) next.set(region.id, region);
    return [...next.values()];
  }, [sls, sessionSls]);
  function startNewLocation() {
    setForm({ ...empty, sls_id: availableSls[0]?.id || "" });
    setPicking(false);
    setLocationAccuracy(null);
    setConfirmDelete(false);
    setTab("location");
  }
  function handleSlsCurrentLocation() {
    if (locating || busy) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      notify("Lokasi perangkat memerlukan HTTPS atau localhost.");
      return;
    }
    const request = ++locationRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request !== locationRequest.current) return;
        const position: [number, number] = [
          Number(coords.latitude.toFixed(6)),
          Number(coords.longitude.toFixed(6)),
        ];
        setSlsUserLocation(position);
        setLocating(false);
        notify("Peta SLS dipusatkan ke lokasi Anda. Tambahkan titik batas di sekitarnya.");
      },
      () => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        notify("Lokasi belum tersedia. Izinkan akses lokasi lalu coba lagi.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }
  async function saveSls(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await api({
        action: "sls",
        data: {
          id: slsEdit?.id,
          code: data.get("code"),
          name: data.get("name"),
          description: data.get("description"),
          marker_color: data.get("marker_color"),
          is_active: data.get("active") === "on",
          boundary: polygon,
        },
      });
      const saved = result.sls as SLS;
      setSessionSls((current) => [
        ...current.filter((region) => region.id !== saved.id),
        saved,
      ]);
      setSlsEdit(saved);
      setPolygon(saved.boundary || []);
      onSlsChange(saved);
      onRefresh();
      if (!slsEdit) {
        setForm({ ...empty, sls_id: saved.id });
        setTab("location");
        notify("SLS dibuat. Sekarang tambahkan lokasi pada wilayah ini.");
      } else notify("Wilayah SLS diperbarui.");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locating || busy) return;
    if (!coordinatesValid) {
      notify("Koordinat tidak valid.");
      return;
    }
    setBusy(true);
    try {
      const result = await api({ action: "location", data: form });
      onCreated(result.location as Location);
      notify("Lokasi berhasil disimpan.");
      return true;
    } catch (error) {
      notify((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function perform(body: unknown, message: string, close = false) {
    setBusy(true);
    try {
      await api(body);
      notify(message);
      if (close) onDone();
      else {
        void load();
        onRefresh();
      }
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function parseFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      notify("Ukuran file maksimal 5 MB.");
      return;
    }
    setBusy(true);
    setRows([]);
    setImportName(file.name);
    try {
      let records: Record<string, unknown>[] = [];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const Papa = (await import("papaparse")).default;
        const result = Papa.parse<Record<string, string>>(await file.text(), {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h) =>
            h
              .replace(/^\uFEFF/, "")
              .trim()
              .toLowerCase(),
        });
        if (result.errors.length)
          throw Error("Format CSV tidak valid: " + result.errors[0].message);
        records = result.data;
      } else if (file.name.toLowerCase().endsWith(".xlsx")) {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (!ws) throw Error("Lembar kerja kosong.");
        const headers: string[] = [];
        ws.getRow(1).eachCell((c, i) => {
          headers[i] = c.text.trim().toLowerCase();
        });
        ws.eachRow((r, n) => {
          if (n === 1) return;
          const obj: Record<string, unknown> = {};
          headers.forEach((h, i) => {
            obj[h] = r.getCell(i).text;
          });
          records.push(obj);
        });
      } else throw Error("Gunakan file .csv atau .xlsx.");
      if (!records.length || records.length > 1000)
        throw Error("File harus berisi 1 sampai 1.000 baris.");
      setRows(
        records.map((r, i) => {
          const region = availableSls.find(
            (s) => s.code === String(r.kode_sls).trim() && s.is_active,
          );
          const data = {
            sls_id: region?.id || "",
            title: r.judul,
            address: r.alamat || "",
            description: r.deskripsi || "",
            latitude: r.latitude,
            longitude: r.longitude,
            status: "unvisited",
          };
          const valid = locationInput.safeParse(data);
          const error = !region
            ? `${r.kode_sls || "Kode SLS"} tidak ditemukan atau tidak aktif.`
            : String(r.latitude ?? "").trim() === "" ||
                String(r.longitude ?? "").trim() === ""
              ? "Koordinat wajib diisi."
              : !valid.success
                ? "Judul atau koordinat tidak valid."
                : "";
          return {
            data: valid.success ? valid.data : data,
            error,
            line: i + 2,
          };
        }),
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="modal-kicker">
        RUANG PENGELOLA · {user.role.toUpperCase()}
      </span>
      <h2>
        {mode === "manage"
          ? "Kelola data sensus"
          : form.id
            ? "Edit lokasi"
            : "Tambahkan lokasi baru"}
      </h2>
      <p>Data yang rapi membantu pendataan yang lebih baik.</p>
      {mode === "manage" && (
        <Tabs
          value={tab}
          onValueChange={(next) =>
            next === "location" ? startNewLocation() : setTab(next)
          }
        >
          <TabsList className="manager-tabs" variant="line">
          {[
            "comments",
            "locations",
            "location",
            ...(user.role === "admin" ? ["sls", "import", "users"] : []),
          ].map((t) => (
            <TabsTrigger
              key={t}
              value={t}
            >
              {
                {
                  comments: "Komentar",
                  locations: "Manajemen lokasi",
                  location: "Tambah lokasi",
                  sls: "Wilayah SLS",
                  import: "Import data",
                  users: "Pengguna",
                }[t]
              }
            </TabsTrigger>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Keluar akun"
            onClick={onSignOut}
          >
            <LogOut size={15} />
          </Button>
          </TabsList>
        </Tabs>
      )}
      {(slsToDelete || locationToDelete) && (
        <div className="manager-confirm" role="alertdialog" aria-modal="true">
          <div>
            <span className="modal-kicker">KONFIRMASI PENGHAPUSAN</span>
            {slsToDelete ? (
              <>
                <h3>Hapus {slsToDelete.code}?</h3>
                <p>
                  {managedLocations.filter(
                    (item) => item.sls_id === slsToDelete.id,
                  ).length} lokasi di wilayah ini, termasuk kunjungan, komentar,
                  dan referensi foto, akan dihapus permanen.
                </p>
              </>
            ) : (
              <>
                <h3>Hapus {locationToDelete?.title}?</h3>
                <p>
                  Lokasi ini beserta kunjungan, komentar, dan referensi fotonya
                  akan dihapus permanen.
                </p>
              </>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                  const removed = slsToDelete
                    ? await perform(
                        { action: "delete-sls", id: slsToDelete.id },
                        "SLS beserta lokasi di dalamnya dihapus.",
                      )
                    : await perform(
                        { action: "delete-location", id: locationToDelete?.id },
                        "Lokasi dihapus.",
                      );
                  if (removed) {
                    setSlsToDelete(null);
                    setLocationToDelete(null);
                    setSlsEdit(null);
                    setPolygon([]);
                  }
                }}
              >
                Hapus permanen
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSlsToDelete(null);
                  setLocationToDelete(null);
                }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {tab === "locations" && (
        <section className="location-management">
          <div className="management-heading">
            <div>
              <h3>Manajemen lokasi</h3>
              <p>{managedLocations.length} lokasi tersedia untuk dikelola.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={startNewLocation}>
              <Plus size={15} /> Tambah
            </Button>
          </div>
          <Input
            className="management-search"
            aria-label="Cari lokasi untuk dikelola"
            placeholder="Cari nama atau alamat lokasi…"
            value={locationSearch}
            onChange={(event) => setLocationSearch(event.target.value)}
          />
          <div
            className="management-location-list"
            aria-busy={managementLoading}
          >
            {managementLoading ? (
              <ManagerListSkeleton />
            ) : (
              visibleManagedLocations.map((item) => {
                const region = availableSls.find((s) => s.id === item.sls_id);
                return (
                  <article key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.address || "Tanpa alamat"}</span>
                      <small>{region?.code || "SLS tidak tersedia"}</small>
                    </div>
                    <div className="management-row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setForm({ ...empty, ...item, sls_id: item.sls_id });
                          setPicking(false);
                          setTab("location");
                        }}
                      >
                        Edit
                      </button>
                      {user.role === "admin" && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => setLocationToDelete(item)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
            {!managementLoading && !visibleManagedLocations.length && (
              <p className="muted">Lokasi tidak ditemukan.</p>
            )}
          </div>
        </section>
      )}
      {tab === "location" && (
        <form onSubmit={saveLocation}>
          <div className="form-grid">
            <label>
              Judul lokasi
              <Input
                required
                minLength={2}
                maxLength={160}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Contoh: Rumah Bapak Ahmad"
              />
            </label>
            <label>
              Wilayah SLS
              <select
                value={form.sls_id}
                required
                onChange={(e) => setForm({ ...form, sls_id: e.target.value })}
              >
                {availableSls
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label>
            Alamat
            <Input
              value={form.address}
              maxLength={500}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Alamat dari data sensus"
            />
          </label>
          <label>
            Deskripsi
            <Textarea
              value={form.description}
              maxLength={3000}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <div className="form-grid">
            <label>
              Latitude
              <Input
                required
                type="number"
                min={-90}
                max={90}
                step="any"
                value={form.latitude}
                disabled={locating}
                onChange={(e) =>
                  setForm({
                    ...form,
                    latitude: e.target.value as unknown as number,
                  })
                }
              />
            </label>
            <label>
              Longitude
              <Input
                required
                type="number"
                min={-180}
                max={180}
                step="any"
                value={form.longitude}
                disabled={locating}
                onChange={(e) =>
                  setForm({
                    ...form,
                    longitude: e.target.value as unknown as number,
                  })
                }
              />
            </label>
          </div>
          <div className="coordinate-actions">
            <button
              type="button"
              className="secondary"
              disabled={locating || busy}
              onClick={handleCurrentLocation}
              aria-busy={locating}
            >
              {locating ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <LocateFixed size={16} />
              )}
              {locating ? "Mencari lokasi…" : "Lokasi saat ini"}
            </button>
            <button
              type="button"
              className={"secondary " + (picking ? "picking" : "")}
              disabled={locating || busy}
              onClick={() => setPicking(!picking)}
            >
              <MapPin size={16} />
              {picking
                ? "Klik titik pada peta di bawah"
                : "Pilih lokasi dari peta"}
            </button>
          </div>
          <p className="coordinate-help" role="status">
            {locating
              ? "Izinkan akses lokasi jika diminta oleh browser."
              : locationAccuracy !== null
                ? `Perkiraan akurasi perangkat: ±${locationAccuracy} meter. Periksa posisi pin pada peta.`
                : "Gunakan lokasi perangkat untuk mengisi koordinat secara otomatis."}
          </p>
          <div className="editor-map">
            <Map
              markers={markers}
              sls={availableSls}
              center={coordinatesValid ? center : undefined}
              onMapClick={
                picking
                  ? (lat, lng) =>
                      setForm({
                        ...form,
                        latitude: Number(lat.toFixed(6)),
                        longitude: Number(lng.toFixed(6)),
                      })
                  : undefined
              }
            />
          </div>
          <label>
            Foto lokasi <small>JPG, PNG, WebP · maksimal 5 MB</small>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  const data = new FormData();
                  data.set("file", file);
                  const res = await fetch("/api/upload", {
                    method: "POST",
                    body: data,
                  });
                  const result = await res.json();
                  if (!res.ok) throw Error(result.error);
                  setForm({ ...form, image_url: result.url });
                  notify("Foto berhasil diunggah.");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {form.image_url && (
            <div className="uploaded-image">
              <Image
                unoptimized
                width={180}
                height={130}
                src={form.image_url}
                alt="Preview foto lokasi"
              />
              <button
                className="danger"
                type="button"
                onClick={() => setForm({ ...form, image_url: "" })}
              >
                Hapus foto
              </button>
            </div>
          )}
          <div className="form-actions">
            {form.id && user.role === "admin" && (
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} />
                Hapus lokasi
              </button>
            )}
            <Button className="primary" disabled={busy || locating}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Simpan lokasi
            </Button>
          </div>
          {confirmDelete && (
            <div className="info-box">
              <span>Hapus lokasi ini beserta komentar dan kunjungannya?</span>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() =>
                  perform(
                    { action: "delete-location", id: form.id },
                    "Lokasi dihapus.",
                    true,
                  )
                }
              >
                Ya, hapus
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                Batal
              </button>
            </div>
          )}
        </form>
      )}
      {tab === "comments" && (
        <div className="moderation-list" aria-busy={managementLoading}>
          {managementLoading ? (
            <ManagerCommentSkeleton />
          ) : !moderation.length && (
            <div className="empty-state">
              <Check size={32} />
              <h3>Belum ada komentar</h3>
              <p>Komentar yang dikirim pengunjung akan muncul di sini.</p>
            </div>
          )}
          {!managementLoading && moderation.map((c) => (
            <article key={c.id}>
              <header>
                <strong>{c.name}</strong>
                <span className="sls-tag">Publik</span>
              </header>
              <p>{c.comment}</p>
              <small>
                Lokasi: {c.location_id} ·{" "}
                {new Date(c.created_at).toLocaleDateString("id-ID")}
              </small>
              <div className="form-actions">
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => setCommentToDelete(c.id)}
                >
                  <Trash2 size={15} />
                  Hapus komentar
                </button>
              </div>
            </article>
          ))}
          {commentToDelete && (
            <div className="info-box">
              Hapus komentar ini dari halaman publik?
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  perform(
                    { action: "delete-comment", id: commentToDelete },
                    "Komentar dihapus.",
                  );
                  setCommentToDelete(null);
                }}
              >
                Hapus
              </button>
              <button onClick={() => setCommentToDelete(null)}>Batal</button>
            </div>
          )}
        </div>
      )}
      {tab === "sls" && (
        <>
          <div className="region-list">
            {availableSls.map((s) => (
              <div className="region-edit-row" key={s.id}>
                <span
                  className="region-dot"
                  style={{ background: s.marker_color }}
                />
                <strong>
                  {s.code} · {s.name}
                </strong>
                <button
                  type="button"
                  onClick={() => {
                    setSlsEdit(s);
                    setPolygon(s.boundary || []);
                    setSlsUserLocation(null);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  title="Hapus SLS kosong"
                  onClick={() => setSlsToDelete(s)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <h3>{slsEdit ? "Edit wilayah" : "Tambah wilayah"}</h3>
          <form
            key={slsEdit?.id || "new"}
            onSubmit={saveSls}
          >
            <div className="form-grid">
              <label>
                Kode SLS
                <input
                  name="code"
                  required
                  pattern="SLS-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*"
                  placeholder="SLS-005"
                  defaultValue={slsEdit?.code}
                />
              </label>
              <label>
                Nama wilayah
                <input
                  name="name"
                  required
                  minLength={2}
                  defaultValue={slsEdit?.name}
                />
              </label>
            </div>
            <label>
              Deskripsi
              <input name="description" defaultValue={slsEdit?.description} />
            </label>
            <div className="form-grid">
              <label>
                Warna marker
                <input
                  type="color"
                  name="marker_color"
                  defaultValue={slsEdit?.marker_color || "#238c6d"}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={slsEdit?.is_active ?? true}
                />
                Wilayah aktif
              </label>
            </div>
            <div className="polygon-editor-heading">
              <div>
                <strong>Batas wilayah SLS</strong>
                <span>
                  Klik peta untuk menambah titik. Seret titik untuk mengubahnya.
                </span>
              </div>
              <button
                type="button"
                className="secondary"
                disabled={!polygon.length}
                onClick={() => setPolygon([])}
              >
                Hapus poligon
              </button>
            </div>
            <div className="coordinate-actions sls-location-actions">
              <button
                type="button"
                className="secondary"
                disabled={locating || busy}
                onClick={handleSlsCurrentLocation}
                aria-busy={locating}
              >
                {locating ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <LocateFixed size={16} />
                )}
                {locating ? "Mencari lokasi…" : "Lokasi saat ini"}
              </button>
              <span>
                Peta dipusatkan ke posisi Anda; klik peta untuk menggambar batas.
              </span>
            </div>
            <div className="polygon-editor-map">
              <Map
                markers={[]}
                sls={availableSls}
                center={slsUserLocation || polygon[0] || [-6.184, 106.837]}
                userLocation={slsUserLocation}
                polygon={polygon}
                polygonEditable
                onPolygonChange={setPolygon}
              />
            </div>
            <p className="coordinate-help">
              {polygon.length < 3
                ? `Tambahkan ${3 - polygon.length} titik lagi untuk membentuk poligon.`
                : `${polygon.length} titik tersimpan. Poligon akan mengikuti batas yang Anda gambar.`}
            </p>
            <div className="form-actions">
              {slsEdit && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSlsEdit(null);
                    setPolygon([]);
                  }}
                >
                  Batal edit
                </button>
              )}
              <button className="primary" disabled={busy || locating}>
                Simpan SLS
              </button>
            </div>
          </form>
        </>
      )}
      {tab === "import" && (
        <>
          <div className="info-box">
            <Info size={18} />
            <span>
              Unggah CSV atau Excel (.xlsx), periksa hasil validasi, lalu
              konfirmasi import. Maksimal 1.000 baris per file.
            </span>
          </div>
          <a
            className="template-link"
            download="template-lokasi.csv"
            href={
              "data:text/csv;charset=utf-8," +
              encodeURIComponent(
                "kode_sls,judul,alamat,latitude,longitude,deskripsi\nSLS-001,Rumah Ahmad,Jl. Cemara No. 1,-6.184,106.837,Lokasi sensus\n",
              )
            }
          >
            <FileSpreadsheet size={16} />
            Unduh template CSV
          </a>
          <label className="upload-zone">
            <Upload size={30} />
            <strong>{importName || "Pilih file data lokasi"}</strong>
            <span>CSV atau XLSX · maksimal 5 MB</span>
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={busy}
              onChange={(e) =>
                e.target.files?.[0] && parseFile(e.target.files[0])
              }
            />
          </label>
          {rows.length > 0 && (
            <>
              <div className="import-summary">
                <strong>
                  {rows.filter((r) => !r.error).length} baris valid
                </strong>
                <span>
                  {rows.filter((r) => r.error).length} baris bermasalah · tidak
                  akan diimpor
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>Judul</th>
                      <th>Koordinat</th>
                      <th>Validasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td>{String(r.data.title || "—")}</td>
                        <td>
                          {String(r.data.latitude)}, {String(r.data.longitude)}
                        </td>
                        <td className={r.error ? "error-text" : "success-text"}>
                          {r.error || "Valid"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="primary full"
                disabled={busy || !rows.some((r) => !r.error)}
                onClick={() =>
                  perform(
                    {
                      action: "import",
                      rows: rows.filter((r) => !r.error).map((r) => r.data),
                    },
                    "Data lokasi berhasil diimpor.",
                    true,
                  )
                }
              >
                Konfirmasi import {rows.filter((r) => !r.error).length} lokasi
              </button>
            </>
          )}
        </>
      )}
      {tab === "users" && (
        <>
          <div className="region-list">
            {users.map((u) => (
              <div key={u.id} className="region-edit-row">
                <strong>
                  {u.name}
                  <small>{u.email}</small>
                </strong>
                <span className="sls-tag">{u.role}</span>
                {u.id !== user.id && (
                  <button
                    title="Pilih pengguna untuk dihapus"
                    onClick={() => {
                      setImportName(u.id);
                      setConfirmDelete(true);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {confirmDelete && (
            <div className="info-box">
              Hapus akses pengguna ini?
              <button
                className="danger"
                onClick={() => {
                  perform(
                    { action: "delete-user", id: importName },
                    "Pengguna dihapus.",
                  );
                  setConfirmDelete(false);
                }}
              >
                Hapus
              </button>
              <button onClick={() => setConfirmDelete(false)}>Batal</button>
            </div>
          )}
          <h3>Tambah pengguna</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              perform(
                { action: "user", data: Object.fromEntries(data) },
                "Pengguna ditambahkan.",
              );
            }}
          >
            <div className="form-grid">
              <label>
                Nama
                <input name="name" minLength={2} required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Kata sandi
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  placeholder="Minimal 12 karakter"
                />
              </label>
              <label>
                Peran
                <select name="role">
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <button className="primary" disabled={busy || locating}>
              <Plus size={16} />
              Tambah pengguna
            </button>
          </form>
        </>
      )}
    </>
  );
}

function ManagerListSkeleton() {
  return (
    <div className="manager-skeleton-list" aria-label="Memuat lokasi">
      {Array.from({ length: 5 }, (_, index) => (
        <div className="manager-skeleton-row" key={index}>
          <Skeleton className="skeleton skeleton-line manager-skeleton-title" />
          <Skeleton className="skeleton skeleton-line manager-skeleton-detail" />
        </div>
      ))}
    </div>
  );
}

function ManagerCommentSkeleton() {
  return (
    <div className="manager-skeleton-list" aria-label="Memuat komentar">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="manager-skeleton-row" key={index}>
          <Skeleton className="skeleton skeleton-line manager-skeleton-title" />
          <Skeleton className="skeleton skeleton-line manager-skeleton-comment" />
          <Skeleton className="skeleton skeleton-line manager-skeleton-detail" />
        </div>
      ))}
    </div>
  );
}
