"use client";
import { BusinessHoursSettings } from "@/components/business-hours";
import { ToastNotification, useToast } from "@/components/ui/toast-notification";
import { BusinessHeader } from "@/components/business-header";
import { BusinessLocationFields } from "@/components/business-location-fields";
import { BusinessLocationMap } from "@/components/business-location-map";
import { mapPointSchema, type MapAddress } from "@/lib/business-map";
import { businessLocationProblem } from "@/lib/business-regions";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useActionState,
  startTransition,
} from "react";
import type { Business } from "@/lib/validation";
import { createBusiness, saveBusinessProfile, saveLoyaltySettings } from "@/app/actions";
import BusinessPaymentSettings from "@/components/business-payment-settings";
import type { PaymentSettings } from "@/lib/business-payments";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  ImagePlus,
  X,
} from "lucide-react";
type Category = "toko" | "restoran" | "barbershop";
const labels: Record<Category, string> = {
  toko: "Toko / Minimarket / Kios",
  restoran: "Restoran / Cafe",
  barbershop: "Barbershop / Salon",
};
const input =
  "h-10 rounded-lg border border-[#454d5b] bg-[#273242] px-3 text-sm font-normal text-white placeholder:font-normal placeholder:text-[#a4a7ac] outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20";
export default function OriginalIdentity({
  ownerName,
  userId,
  business,
  onboarding = false,
  embedded = false,
  initialCategory = "toko",
  payments,
  paymentSettingsNode,
}: {
  ownerName: string;
  userId: string;
  business?: Business;
  onboarding?: boolean;
  embedded?: boolean;
  initialCategory?: "toko" | "restoran" | "barbershop";
  payments?: PaymentSettings;
  paymentSettingsNode?: React.ReactNode;
}) {
  const [serverState, dispatchIdentity, pending] = useActionState(
    business ? saveBusinessProfile : createBusiness,
    {},
  );
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const resolveCategory = (cat?: string): Category => {
    if (cat === "restaurant" || cat === "restoran") return "restoran";
    if (cat === "barbershop") return "barbershop";
    return "toko";
  };
  const [category] = useState<Category>(
    business?.category ? resolveCategory(business.category) : resolveCategory(initialCategory),
  );
  const [current, setCurrent] = useState(business);
  const { toast, showToast, hideToast } = useToast(3000);
  const submittedRef = useRef(false);
  const fromBusiness = (b: Business) => ({
    name: b.name,
    address: b.street_address || b.address,
    city: b.city || "",
    province: b.province || "",
    district: b.district || "",
    village: b.village || "",
    latitude: b.latitude == null ? "" : String(b.latitude),
    longitude: b.longitude == null ? "" : String(b.longitude),
    phone: b.phone,
    description: b.description || "",
  });
  const logoFor = (b?: Business) =>
    b?.logo_path
      ? {
          url: `/api/business/${b.id}/logo?v=${b.profile_revision || 0}`,
          name: "Logo usaha",
        }
      : null;
  const [form, setForm] = useState(
    business
      ? fromBusiness(business)
      : {
          name: "",
          address: "",
          city: "",
          province: "",
          district: "",
          village: "",
          latitude: "",
          longitude: "",
          phone: "",
          description: "",
        },
  );
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(
    logoFor(business),
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [logoOperation, setLogoOperation] = useState<
    "keep" | "replace" | "remove"
  >("keep");
  const [error, setError] = useState("");
  const [mapNotice, setMapNotice] = useState("");
  const selectedPoint = mapPointSchema.safeParse({ latitude: Number(form.latitude), longitude: Number(form.longitude) });
  const useMapLocation = (value: MapAddress | null) => {
    if (!value) { setForm(current => ({ ...current, latitude: '', longitude: '' })); setMapNotice('Titik dihapus dari formulir. Simpan perubahan untuk menerapkannya.'); return; }
    setForm(current => ({ ...current, address: value.address, province: value.province, city: value.city, district: value.district || '', village: value.village || '', latitude: String(value.latitude), longitude: String(value.longitude) }));
    setMapNotice(value.incomplete ? 'Titik dipilih. Periksa alamat dan lengkapi wilayah yang masih kosong.' : 'Alamat dari peta diterapkan. Periksa kembali sebelum menyimpan.');
  };
  const [logoError, setLogoError] = useState("");
  // Loyalty points configuration state
  const [loyaltyActive, setLoyaltyActive] = useState<boolean>(() => {
    return business?.loyalty_active ?? false;
  });
  const [loyaltyPointNominal, setLoyaltyPointNominal] = useState<number>(() => {
    return Number(business?.loyalty_point_nominal) || 50000;
  });
  const [nominalInput, setNominalInput] = useState<string>(() => {
    const init = Number(business?.loyalty_point_nominal) || 50000;
    return init.toLocaleString("id-ID");
  });
  const handleNominalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    if (!raw) {
      setNominalInput("");
      setLoyaltyPointNominal(0);
      return;
    }
    const num = parseInt(raw, 10);
    setLoyaltyPointNominal(num);
    setNominalInput(num.toLocaleString("id-ID"));
  };
  const [loyaltyPending, setLoyaltyPending] = useState(false);
  const handleSaveLoyalty = async () => {
    if (!business) return;
    if (loyaltyActive && (!loyaltyPointNominal || loyaltyPointNominal <= 0)) {
      showToast("error", "Nominal transaksi per poin harus lebih besar dari Rp0.");
      return;
    }
    setLoyaltyPending(true);
    const fd = new FormData();
    fd.set("loyaltyActive", loyaltyActive ? "true" : "false");
    fd.set("loyaltyPointNominal", String(loyaltyPointNominal || 50000));
    try {
      const res = await saveLoyaltySettings({}, fd);
      if (res.error) {
        showToast("error", res.error);
      } else {
        showToast("success", res.success || "Pengaturan poin member berhasil disimpan.");
        router.refresh();
      }
    } catch (err: any) {
      showToast("error", err?.message || "Gagal menyimpan pengaturan poin member.");
    } finally {
      setLoyaltyPending(false);
    }
  };
  useEffect(() => {
    if (!business)
      try {
        const saved = JSON.parse(
          sessionStorage.getItem(`usahaku_identity:${userId}`) || "null",
        );
        if (saved?.form) setForm(current=>({...current,...saved.form,district:saved.form.district||'',village:saved.form.village||'',latitude:saved.form.latitude||'',longitude:saved.form.longitude||''}));
      } catch {}
  }, [userId, business]);
  useEffect(() => {
    setError(serverState.error || "");
    if (serverState.business) {
      setCurrent(serverState.business);
      setForm(fromBusiness(serverState.business));
      setLogo(logoFor(serverState.business));
      setSelectedFile(null);
      setLogoOperation("keep");
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
    if (submittedRef.current) {
      submittedRef.current = false;
      if (serverState.error) {
        showToast("error", serverState.error);
      } else if (serverState.success || serverState.business) {
        showToast("success", "Perubahan berhasil disimpan");
      }
    }
  }, [serverState, showToast]);
  const update = (k: keyof typeof form, v: string) =>
    setForm((x) => ({ ...x, [k]: v }));
  const removeLogo = (e?: React.MouseEvent) => {
    e?.preventDefault();
    setLogo(null);
    setSelectedFile(null);
    setLogoOperation("remove");
    setLogoError("");
    if (logoInputRef.current) logoInputRef.current.value = "";
  };
  const handleLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      e.target.value = "";
      return setLogoError("Gunakan file PNG, JPG, atau WebP.");
    }
    if (f.size > 2 * 1024 * 1024) {
      e.target.value = "";
      return setLogoError("Ukuran logo maksimal 2 MB.");
    }
    setLogoError("");
    setSelectedFile(f);
    setLogoOperation("replace");
    const r = new FileReader();
    r.onload = () => setLogo({ url: String(r.result), name: f.name });
    r.readAsDataURL(f);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (
      [form.name, form.address, form.city, form.province, form.phone]
        .some((value) => !value.trim())
    ) {
      const msg = "Lengkapi semua informasi dasar yang wajib diisi.";
      setError(msg);
      showToast("error", msg);
      return;
    }
    const locationError = businessLocationProblem(form, business);
    if (locationError) {
      setError(locationError);
      showToast("error", locationError);
      return;
    }
    if (loyaltyActive && (!loyaltyPointNominal || loyaltyPointNominal <= 0)) {
      const msg = "Nominal transaksi per poin harus lebih besar dari Rp0.";
      setError(msg);
      showToast("error", msg);
      return;
    }
    setError("");
    submittedRef.current = true;
    if (!business)
      try {
        sessionStorage.setItem(
          `usahaku_identity:${userId}`,
          JSON.stringify({ form }),
        );
      } catch {}
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.set(key, value));
    data.set("category", category === "restoran" ? "restaurant" : category === "barbershop" ? "barbershop" : "store");
    data.set("ownerName", ownerName);
    data.set("loyaltyActive", loyaltyActive ? "true" : "false");
    data.set("loyaltyPointNominal", String(loyaltyPointNominal || 50000));
    if (onboarding) data.set("next", "setup");
    data.set("logoOperation", logoOperation);
    if (selectedFile) data.set("logo", selectedFile);
    if (current) data.set("revision", String(current.profile_revision || 0));
    startTransition(() => dispatchIdentity(data));
  };
  const Container = embedded ? "div" : "main";
  return (
    <Container
      className={
        embedded
          ? "w-full text-white"
          : "min-h-screen bg-[#1c222e] text-[#ffffff]"
      }
    >
      {!embedded && <BusinessHeader ownerName={ownerName} />}
      <div
        className={
          embedded
            ? "w-full"
            : "mx-auto max-w-[1180px] px-5 py-6 sm:px-8 lg:py-8"
        }
      >
        {onboarding && (
          <>
            <Progress />
            <p className="mt-8 text-xs font-normal tracking-wide text-[#24cbc5]">
              PENGATURAN USAHA • LANGKAH 2 DARI 3
            </p>
          </>
        )}
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
          {onboarding
            ? "Kenalkan usaha Anda"
            : category === "restoran"
              ? "Pengaturan restoran"
              : category === "barbershop"
                ? "Pengaturan barbershop"
                : "Pengaturan toko"}
        </h1>
        <p className="mt-3 text-[#a4a7ac]">
          Lengkapi informasi usaha Anda. Identitas ini membantu pelanggan
          mengenali dan menghubungi usaha Anda.
        </p>
        <form
          onSubmit={submit}
          className="mt-8 grid gap-5 lg:grid-cols-[1.65fr_.9fr]"
        >
          <section className="rounded-xl border border-[#454d5b] bg-[#273242] p-5 sm:p-6">
            <h2 className="text-lg font-medium text-white">Informasi dasar</h2>
            <p className="mt-1 text-sm text-[#a4a7ac]">
              Isian bertanda * wajib diisi.
            </p>
            <div className="mt-6 flex flex-col gap-5">
              <Field label="Nama usaha *">
                <input
                  className={input}
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Nama usaha Anda"
                />
              </Field>
              <BusinessLocationMap value={selectedPoint.success ? selectedPoint.data : null} disabled={pending} onChange={useMapLocation} />
              {mapNotice && <p role="status" className="text-xs text-[#c5cbd5]">{mapNotice}</p>}
              <Field label="Detail alamat *">
                <input
                  aria-label="Alamat usaha *"
                  className={input}
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="Nama jalan, nomor, dan detail alamat"
                />
              </Field>
              <BusinessLocationFields
                value={{ province: form.province, city: form.city, district: form.district, village: form.village }}
                previous={business}
                disabled={pending}
                onChange={(location) =>
                  setForm((current) => ({ ...current, ...location, latitude: '', longitude: '' }))
                }
              />
              <Field label="Nomor kontak usaha *">
                <input
                  className={input}
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="08 atau +62"
                />
              </Field>
              <Field label="Deskripsi usaha">
                <textarea
                  className="min-h-28 rounded-lg border border-[#454d5b] bg-[#273242] p-3 text-sm font-normal text-white placeholder:font-normal placeholder:text-[#a4a7ac] outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20"
                  maxLength={300}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Ceritakan singkat usaha Anda"
                />
                <span className="text-xs text-[#a4a7ac]">
                  {form.description.length}/300
                </span>
              </Field>
            </div>
          </section>
          <aside className="flex flex-col gap-5">
            <section className="rounded-xl border border-[#454d5b] bg-[#273242] p-5">
              <h2 className="font-medium text-white">Logo usaha</h2>
              <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#454d5b] bg-[#1c222e] p-4 text-center">
                {logo ? (
                  <>
                    <div className="relative">
                      <img
                        src={logo.url}
                        alt="Preview logo usaha"
                        className="size-20 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        title="Remove logo"
                        aria-label="Remove logo"
                        className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-[#454d5b] bg-[#273242] text-[#a4a7ac] shadow-sm transition-colors hover:border-[#c24156] hover:bg-[#fff4f5] hover:text-[#c24156]"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                      <span className="mt-2 text-xs text-[#a4a7ac]"></span>
                      <span className="mt-2 text-sm font-normal text-[#24cbc5]">
                        Ganti logo
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-8 text-[#24cbc5]" />
                    <span className="mt-2 text-sm font-normal">
                      Belum ada logo
                    </span>
                    <span className="mt-2 rounded-lg bg-[#1835d9] px-3 py-2 text-xs font-normal text-white">
                      Unggah logo
                    </span>
                  </>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={handleLogo}
                />
              </label>
              {logoError && (
                <p className="mt-3 text-xs text-[#ffb4ae]">{logoError}</p>
              )}
            </section>
            <section className="rounded-xl border border-[#454d5b] bg-[#273242] p-5">
              <h2 className="font-medium text-white">Kategori utama</h2>
              <p className="mt-3 rounded-lg bg-[#1835d9]/15 p-3 text-sm font-normal text-[#24cbc5]">
                {labels[category]}
              </p>
              {onboarding && (
                <Link
                  href={`/onboarding?category=${category}`}
                  className="mt-4 inline-block text-sm font-normal text-[#24cbc5]"
                >
                  Ubah kategori
                </Link>
              )}
            </section>

            {/* Program Poin Member Section */}
            <section className="rounded-xl border border-[#454d5b] bg-[#273242] p-5 shadow-sm transition-all duration-300">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium text-white">Program Poin Member</h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={loyaltyActive}
                    onClick={() => setLoyaltyActive((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24cbc5] ${
                      loyaltyActive ? "bg-[#24cbc5]" : "bg-[#303640] border-[#454d5b]"
                    }`}
                    aria-label="Aktifkan program poin member"
                  >
                    <span
                      className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        loyaltyActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-1 text-xs text-[#a4a7ac] leading-relaxed">
                  Berikan poin kepada pelanggan setiap kali melakukan transaksi.
                </p>
              </div>

              {/* Collapsible / Expandable Settings Area with Smooth Transition */}
              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  loyaltyActive
                    ? "grid-rows-[1fr] opacity-100 mt-5 pt-5 border-t border-[#454d5b]/60"
                    : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-4">
                    <label className="flex flex-col gap-2 text-sm font-medium text-white">
                      <span>Setiap kelipatan transaksi</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-normal text-[#a4a7ac]">
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={nominalInput}
                          onChange={handleNominalChange}
                          placeholder="50.000"
                          className="h-10 w-full rounded-lg border border-[#454d5b] bg-[#1c222e] pl-9 pr-3 text-sm font-normal text-white placeholder:font-normal placeholder:text-[#a4a7ac] outline-none focus:border-[#24cbc5] focus:ring-2 focus:ring-[#24cbc5]/20"
                        />
                      </div>
                    </label>

                    <p className="text-xs text-[#a4a7ac] leading-relaxed">
                      Setiap transaksi senilai{" "}
                      <span className="font-medium text-white">
                        Rp{(loyaltyPointNominal || 0).toLocaleString("id-ID")}
                      </span>{" "}
                      mendapatkan{" "}
                      <span className="font-medium text-[#24cbc5]">1 poin</span>.
                    </p>

                    {/* Preview Simulasi Poin Dinamis */}
                    <div className="overflow-hidden rounded-xl border border-[#454d5b]/80 bg-[#1c222e]">
                      <div className="border-b border-[#454d5b]/80 bg-[#273242]/70 px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-[#a4a7ac]">
                        Simulasi Perolehan Poin
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#454d5b]/60 text-[#a4a7ac]">
                            <th className="py-2.5 px-3.5 font-medium">Total transaksi</th>
                            <th className="py-2.5 px-3.5 text-right font-medium">Poin diperoleh</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#454d5b]/40">
                          {[0.5, 1, 2, 3, 4].map((mult) => {
                            const total = Math.round((loyaltyPointNominal || 0) * mult);
                            const pts =
                              loyaltyPointNominal > 0 ? Math.floor(total / loyaltyPointNominal) : 0;
                            return (
                              <tr key={mult} className="hover:bg-[#273242]/30 transition-colors">
                                <td className="py-2 px-3.5 text-[#c5cbd5] font-normal">
                                  Rp{total.toLocaleString("id-ID")}
                                </td>
                                <td className="py-2 px-3.5 text-right font-medium text-[#24cbc5]">
                                  {pts} poin
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!onboarding && business && (
                      <button
                        type="button"
                        onClick={handleSaveLoyalty}
                        disabled={loyaltyPending}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1835d9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#132c9e] transition-colors disabled:opacity-50"
                      >
                        {loyaltyPending ? "Menyimpan..." : "Simpan pengaturan poin"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {!loyaltyActive && !onboarding && business && business.loyalty_active && (
                <div className="mt-4 pt-4 border-t border-[#454d5b]/60">
                  <button
                    type="button"
                    onClick={handleSaveLoyalty}
                    disabled={loyaltyPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1835d9] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#132c9e] transition-colors disabled:opacity-50"
                  >
                    {loyaltyPending ? "Menyimpan..." : "Simpan pengaturan poin"}
                  </button>
                </div>
              )}
            </section>
          </aside>
          <div className="flex items-center justify-between border-t border-[#454d5b] pt-5 lg:col-span-2">
            <button
              type="button"
              onClick={() =>
                router.push(onboarding ? "/onboarding" : "/dashboard")
              }
              className="inline-flex items-center gap-2 rounded-xl border bg-[#273242] px-5 py-3 text-sm font-normal text-[#a4a7ac]"
            >
              <ArrowLeft className="size-4" />
              Kembali
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1835d9] px-5 py-3 text-sm font-normal text-white"
            >
              {onboarding ? "Simpan & lanjutkan" : "Simpan perubahan"}
              <ArrowRight className="size-4" />
            </button>
          </div>
          {serverState.warning && (
            <p role="status" className="text-sm text-[#f59e0b] lg:col-span-2">
              {serverState.warning}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[#ffb4ae] lg:col-span-2">
              {error}
            </p>
          )}
        </form>
        {!onboarding && business && (
          <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div>
              <BusinessHoursSettings business={business} onNotify={showToast} />
            </div>
            {(paymentSettingsNode || payments) && (
              <div>
                {payments ? (
                  <BusinessPaymentSettings
                    initial={payments}
                    businessId={business.id}
                    onNotify={showToast}
                  />
                ) : React.isValidElement(paymentSettingsNode) ? (
                  React.cloneElement(paymentSettingsNode as React.ReactElement<any>, {
                    onNotify: showToast,
                  })
                ) : (
                  paymentSettingsNode
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <ToastNotification toast={toast} onClose={hideToast} />
    </Container>
  );
}
function Progress() {
  return (
    <div className="rounded-2xl border border-[#454d5b] bg-[#273242] p-5">
      <div className="grid gap-4 md:grid-cols-3">
        {["Kategori usaha", "Identitas usaha", "Setup usaha"].map((x, i) => (
          <div className="flex items-center gap-3" key={x}>
            <div className="grid size-9 place-items-center rounded-full bg-[#1835d9] text-white">
              {i < 2 ? <Check className="size-4" /> : "3"}
            </div>
            <span className="text-sm font-normal">{x}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
