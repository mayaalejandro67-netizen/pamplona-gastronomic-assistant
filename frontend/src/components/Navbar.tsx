import { BookOpen, Clock, Heart, Home, Moon, Sun, UtensilsCrossed } from "lucide-react";
import { getCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Language, NavTab } from "@/types";

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  favoritesCount: number;
}

export function Navbar({
  activeTab,
  onTabChange,
  language,
  onLanguageChange,
  theme,
  onToggleTheme,
  favoritesCount,
}: NavbarProps) {
  const t = getCopy(language);

  const navItems: { id: NavTab; label: string; icon: typeof Home; badge?: number }[] = [
    { id: "home", label: t.nav.home, icon: Home },
    { id: "guides", label: t.nav.guides, icon: BookOpen },
    { id: "favorites", label: t.nav.favorites, icon: Heart, badge: favoritesCount || undefined },
    { id: "history", label: t.nav.history, icon: Clock },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg-header)] backdrop-blur-sm transition-colors">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-5 py-3">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onTabChange("home")}
          className="flex items-center gap-3 text-left cursor-pointer"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-brand)] text-white shadow-sm">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-editorial text-lg font-bold leading-tight text-[var(--fg)] sm:text-xl">
              Pamplona Gastronomic Assistant
            </h1>
            <p className="text-xs text-[var(--fg-muted)]">{t.brandSubtitle}</p>
          </div>
        </button>

        {/* Center nav tabs */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer",
                  active
                    ? "text-[var(--accent-sage-text)]"
                    : "text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="ml-0.5 rounded-full bg-[var(--accent-brand)] px-1.5 py-0.2 text-[10px] font-semibold text-white">
                    {item.badge}
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[var(--accent-sage)]" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Right: skyline accent + ES/EN toggle + Dark/Light toggle */}
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 180 36"
            className="hidden h-8 w-36 text-[var(--border)] xl:block"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden="true"
          >
            <path d="M2 34 H178" />
            <path d="M12 34 V22 H26 V34 M16 22 V17 H22 V22" />
            <path d="M32 34 V14 L38 6 L44 14 V34 M48 34 V12 L54 4 L60 12 V34" />
            <path d="M66 34 V20 H94 V34 M72 20 V15 H88 V20 M78 15 V10 H82 V15" />
            <path d="M100 34 V18 H122 V34 M106 18 V12 H116 V18" />
            <path d="M128 34 V15 L136 8 L144 15 V34" />
            <path d="M150 34 V22 H168 V34" />
          </svg>

          <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onLanguageChange("es")}
              className={cn(
                "rounded-full px-2.5 py-1 transition-colors cursor-pointer",
                language === "es"
                  ? "bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] shadow-xs"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
              )}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange("en")}
              className={cn(
                "rounded-full px-2.5 py-1 transition-colors cursor-pointer",
                language === "en"
                  ? "bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] shadow-xs"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
              )}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            title={
              theme === "dark"
                ? language === "es"
                  ? "Cambiar a modo claro"
                  : "Switch to light mode"
                : language === "es"
                  ? "Cambiar a modo oscuro (Slate & Sage)"
                  : "Switch to dark mode (Slate & Sage)"
            }
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--accent-sage-text)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-[#B5C7A3]" />
            ) : (
              <Moon className="h-4 w-4 text-[#574A3E]" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex items-center justify-around border-t border-[var(--border)] px-2 py-1.5 md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium",
                active
                  ? "bg-[var(--accent-sage-soft)] text-[var(--accent-sage-text)]"
                  : "text-[var(--fg-muted)]",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
