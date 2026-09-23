import Link from "next/link";

export function SystemHeader() {
  return (
    <header className="shellHeader">
      <div className="shellHeaderInner">
        <div className="brand">
          <span className="liveDot" aria-hidden="true" />
          <span>DKIVN</span>
          <span className="muted">VNext Control</span>
        </div>
        <nav className="nav" aria-label="Primary">
          <Link href="/">Overview</Link>
          <Link href="/venues">Venues</Link>
          <Link href="/symbols">Symbols</Link>
          <Link href="/alerts">Alerts</Link>
        </nav>
      </div>
    </header>
  );
}
