"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus,
  Upload,
  LogOut,
  MapPin,
  LocateFixed,
  Check,
  Trash2,
  FileSpreadsheet,
  Info,
  LoaderCircle,
} from "lucide-react";
import Map from "./map";
import Image from "next/image";
import { api, User } from "./explorer";
import { Location, SLS, Comment } from "@/lib/data";
import { locationInput } from "@/lib/validation";
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
    [locationSearch, setLocationSearch] = useState("");
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
  const load = () =>
    fetch("/api/data?manage=1")
      .then((r) => r.json())
      .then((d) => {
        setModeration(d.comments || []);
        setUsers(d.users || []);
        setManagedLocations(d.locations || locations);
      })
      .catch(() => notify("Data pengelolaan tidak dapat dimuat."));
  useEffect(() => {
    if (mode === "manage") load();
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
              id: location?.id || "preview",
              latitude: center[0],
              longitude: center[1],
              visits: 0,
            },
          ]
        : [],
    [form, location, center, coordinatesValid],
  );
  const visibleManagedLocations = useMemo(() => {
    const needle = locationSearch.trim().toLowerCase();
    if (!needle) return managedLocations;
    return managedLocations.filter((item) =>
      `${item.title} ${item.address}`.toLowerCase().includes(needle),
    );
  }, [managedLocations, locationSearch]);
  async function perform(body: unknown, message: string, close = false) {
    setBusy(true);
    try {
      await api(body);
      notify(message);
      if (close) onDone();
      else {
        load();
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
          const region = sls.find(
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
          : location
            ? "Edit lokasi"
            : "Tambahkan lokasi baru"}
      </h2>
      <p>Data yang rapi membantu pendataan yang lebih baik.</p>
      {mode === "manage" && (
        <div className="manager-tabs">
          {[
            "comments",
            "locations",
            "location",
            ...(user.role === "admin" ? ["sls", "import", "users"] : []),
          ].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
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
            </button>
          ))}
          <button title="Keluar akun" onClick={onSignOut}>
            <LogOut size={15} />
          </button>
        </div>
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
            <button type="button" onClick={() => setTab("location")}>
              <Plus size={15} /> Tambah
            </button>
          </div>
          <input
            className="management-search"
            aria-label="Cari lokasi untuk dikelola"
            placeholder="Cari nama atau alamat lokasi…"
            value={locationSearch}
            onChange={(event) => setLocationSearch(event.target.value)}
          />
          <div className="management-location-list">
            {visibleManagedLocations.map((item) => {
              const region = sls.find((s) => s.id === item.sls_id);
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
            })}
            {!visibleManagedLocations.length && (
              <p className="muted">Lokasi tidak ditemukan.</p>
            )}
          </div>
        </section>
      )}
      {tab === "location" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (locating) return;
            if (!coordinatesValid) {
              notify("Koordinat tidak valid.");
              return;
            }
            perform(
              { action: "location", data: form },
              "Lokasi berhasil disimpan.",
              true,
            );
          }}
        >
          <div className="form-grid">
            <label>
              Judul lokasi
              <input
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
                {sls
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
            <input
              value={form.address}
              maxLength={500}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Alamat dari data sensus"
            />
          </label>
          <label>
            Deskripsi
            <textarea
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
              <input
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
              <input
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
              sls={sls}
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
            {location && user.role === "admin" && (
              <button
                type="button"
                className="danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} />
                Hapus lokasi
              </button>
            )}
            <button className="primary" disabled={busy || locating}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Simpan lokasi
            </button>
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
                    { action: "delete-location", id: location?.id },
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
        <div className="moderation-list">
          {!moderation.length && (
            <div className="empty-state">
              <Check size={32} />
              <h3>Belum ada komentar</h3>
              <p>Komentar yang dikirim pengunjung akan muncul di sini.</p>
            </div>
          )}
          {moderation.map((c) => (
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
            {sls.map((s) => (
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
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              perform(
                {
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
                },
                "Wilayah SLS disimpan.",
                true,
              );
            }}
          >
            <div className="form-grid">
              <label>
                Kode SLS
                <input
                  name="code"
                  required
                  pattern="SLS-[A-Za-z0-9-]+"
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
            <div className="polygon-editor-map">
              <Map
                markers={[]}
                sls={sls}
                center={polygon[0] || [-6.184, 106.837]}
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
