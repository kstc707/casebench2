import Link from "next/link";

/** The bar at the top of every page: the site name, then where you are. */
export function SiteHeader({ crumbs }: { crumbs?: React.ReactNode }) {
  return (
    <header className="site-header">
      <Link href="/" className="site-name">
        Casebench 2
      </Link>
      {crumbs && <nav aria-label="Breadcrumb" className="crumbs">{crumbs}</nav>}
    </header>
  );
}
