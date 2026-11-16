import { LogOut } from "lucide-react";
import { BottomNav, MobileMenu, NavLinks, type NavItem } from "./nav-links";
import { PlateMark, Wordmark } from "./plate";
import { signOut } from "@/app/(auth)/actions";

const Brand = () => (
  <span className="flex items-center gap-2.5 text-field-fg"><PlateMark size={30} /><Wordmark className="text-xl" /></span>
);

export function AppShell({ nav, bottomNav, user, children }: { nav: NavItem[]; bottomNav?: NavItem[]; user: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[256px_1fr]">
      <aside className="no-print sticky top-0 z-20 bg-field text-field-fg md:h-screen">
        <MobileMenu brand={<Brand />}><NavLinks items={nav} /><SignOut user={user} /></MobileMenu>
        <div className="hidden h-full flex-col md:flex">
          <div className="flex h-20 items-center px-5"><Brand /></div>
          <div className="flex-1 overflow-y-auto px-3 pb-4"><NavLinks items={nav} /></div>
          <div className="border-t border-field-2 p-3"><SignOut user={user} /></div>
        </div>
      </aside>
      <main className={`mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8 ${bottomNav ? "pb-28 md:pb-8" : ""}`}>{children}</main>
      {bottomNav && <BottomNav items={bottomNav} />}
    </div>
  );
}

function SignOut({ user }: { user: string }) {
  return (
    <form action={signOut} className="mt-2 flex items-center justify-between gap-2 px-2">
      <span className="truncate text-xs text-field-muted">{user}</span>
      <button className="rounded-full p-2 text-field-muted transition-colors hover:bg-field-2 hover:text-field-fg" aria-label="Cerrar sesión" title="Cerrar sesión">
        <LogOut className="size-4" />
      </button>
    </form>
  );
}
