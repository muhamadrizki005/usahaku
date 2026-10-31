export default function AuthErrorPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-sm font-normal text-accent">Usahaku</p>
        <h1 className="mt-3 text-2xl font-normal tracking-tight">Tautan tidak dapat digunakan</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Sesi autentikasi sudah kedaluwarsa atau tautannya tidak valid. Silakan mulai lagi dari halaman masuk.
        </p>
        <a className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-normal text-primary-foreground" href="/login">
          Kembali ke masuk
        </a>
      </section>
    </main>
  )
}
