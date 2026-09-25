import { useNavigate } from "@tanstack/react-router";
import { TopBar, IconButton } from "@/components/TopBar";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  MessageSquareText,
  Trash2,
  Palette,
  Type,
  Info,
  Sparkles,
  Gauge,
} from "lucide-react";
import { AceMateLogo } from "@/components/AceMateLogo";
import {
  useSettings,
  requestClearConversation,
  MODEL_OPTIONS,
  EFFORT_OPTIONS,
  type ResponseStyle,
  type TextSize,
  type Theme,
  type ModelId,
  type EffortMode,
} from "@/lib/settings";

type View = "root" | "response-style" | "theme" | "text-size" | "about" | "model" | "effort";


const RESPONSE_STYLE_OPTIONS: {
  value: ResponseStyle;
  label: string;
  desc: string;
}[] = [
  { value: "concise", label: "Concise", desc: "Short, direct answers." },
  { value: "balanced", label: "Balanced", desc: "Match length to the question." },
  { value: "detailed", label: "Detailed", desc: "Thorough with context and examples." },
];

const THEME_OPTIONS: { value: Theme; label: string; desc: string }[] = [
  { value: "space", label: "Space", desc: "Deep space and soft glass. Calm for long study sessions." },
  { value: "light", label: "Light", desc: "The same study space in daylight." },
];

const TEXT_SIZE_OPTIONS: { value: TextSize; label: string; desc: string }[] = [
  { value: "small", label: "Small", desc: "Denser, more per screen." },
  { value: "medium", label: "Default", desc: "Comfortable everyday reading." },
  { value: "large", label: "Large", desc: "Bigger, easier on the eyes." },
];

export function SettingsPage() {
  const [view, setView] = useState<View>("root");
  const [settings, update] = useSettings();
  const [confirmClear, setConfirmClear] = useState(false);
  const navigate = useNavigate();

  const currentLabel = (view: View): string | null => {
    if (view === "response-style")
      return RESPONSE_STYLE_OPTIONS.find((o) => o.value === settings.responseStyle)?.label ?? null;
    if (view === "theme")
      return THEME_OPTIONS.find((o) => o.value === settings.theme)?.label ?? null;
    if (view === "text-size")
      return TEXT_SIZE_OPTIONS.find((o) => o.value === settings.textSize)?.label ?? null;
    if (view === "model")
      return MODEL_OPTIONS.find((o) => o.value === settings.model)?.label ?? null;
    if (view === "effort")
      return EFFORT_OPTIONS.find((o) => o.value === settings.effort)?.label ?? null;
    return null;
  };

  const doClear = () => {
    requestClearConversation();
    navigate({ to: "/" });
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        leading={
          view !== "root" && (
            <IconButton label="Back" onClick={() => setView("root")}>
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </IconButton>
          )
        }
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto flex w-full max-w-[640px] flex-col px-5 pb-12">

      {view === "root" && (
        <>
          <h1 className="font-display px-1 pb-6 pt-3 text-[30px] font-semibold leading-tight text-[var(--fg)]">
            Settings
          </h1>

          <Section label="Chat">
            <Row
              icon={<MessageSquareText className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              label="Response style"
              value={currentLabel("response-style") ?? undefined}
              onClick={() => setView("response-style")}
            />
            <Row
              icon={<Trash2 className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              label="Clear conversation"
              danger
              hideChevron
              onClick={() => setConfirmClear(true)}
            />
          </Section>

          <Section label="Model">
            <Row
              icon={<Sparkles className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              label="Model"
              value={currentLabel("model") ?? undefined}
              onClick={() => setView("model")}
            />
            <Row
              icon={<Gauge className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              label="Effort"
              value={currentLabel("effort") ?? undefined}
              onClick={() => setView("effort")}
            />
          </Section>

          <Section label="Appearance">
            <Row
              icon={<Palette className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              label="Theme"
              value={currentLabel("theme") ?? undefined}
              onClick={() => setView("theme")}
            />
            <Row
              icon={<Type className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              label="Text size"
              value={currentLabel("text-size") ?? undefined}
              onClick={() => setView("text-size")}
            />
          </Section>

          <Section label="About">
            <Row
              icon={<Info className="h-[18px] w-[18px]" strokeWidth={1.6} />}
              label="About AceMate"
              onClick={() => setView("about")}
            />
          </Section>
        </>
      )}

      {view === "response-style" && (
        <ChoiceView
          title="Response style"
          options={RESPONSE_STYLE_OPTIONS}
          value={settings.responseStyle}
          onChange={(v) => update({ responseStyle: v })}
        />
      )}
      {view === "theme" && (
        <ChoiceView
          title="Theme"
          options={THEME_OPTIONS}
          value={settings.theme}
          onChange={(v) => update({ theme: v })}
        />
      )}
      {view === "text-size" && (
        <ChoiceView
          title="Text size"
          options={TEXT_SIZE_OPTIONS}
          value={settings.textSize}
          onChange={(v) => update({ textSize: v })}
        />
      )}
      {view === "model" && (
        <ChoiceView
          title="Model"
          options={MODEL_OPTIONS}
          value={settings.model}
          onChange={(v: ModelId) => update({ model: v })}
        />
      )}
      {view === "effort" && (
        <ChoiceView
          title="Effort"
          options={EFFORT_OPTIONS}
          value={settings.effort}
          onChange={(v: EffortMode) => update({ effort: v })}
        />
      )}
      {view === "about" && <AboutView />}

      {/* Confirm clear */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 sm:items-center sm:pb-0"
          style={{ background: "var(--overlay-bg)", WebkitBackdropFilter: "blur(6px)", backdropFilter: "blur(6px)" }}
          onClick={() => setConfirmClear(false)}
        >
          <div
            className="popover w-full max-w-sm rounded-[20px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-semibold text-[var(--fg)]">
              Clear conversation?
            </h3>
            <p className="mt-1 text-sm text-[color:var(--ice-dim)]">
              This will remove all messages in the current chat. This can't be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="chip flex-1 rounded-full px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doClear}
                className="flex-1 rounded-full bg-[var(--danger)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
      </div>
    </div>
  );
}

/** A labelled group of rows on one glass panel, like a native settings screen. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="section-label px-4 pb-2">{label}</div>
      <div className="glass overflow-hidden rounded-[18px] [&>*+*]:border-t [&>*+*]:border-[var(--line)]">{children}</div>
    </section>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
  danger,
  hideChevron,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
  hideChevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[52px] w-full items-center gap-3.5 px-4 text-left transition-colors duration-200 hover:bg-[var(--surface-hover)]"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--fg-muted)]"
        style={danger ? { color: "var(--soft-danger)" } : undefined}
      >
        {icon}
      </span>
      <span className="flex-1 text-[15px]" style={{ color: danger ? "var(--soft-danger)" : "var(--fg)" }}>
        {label}
      </span>
      {value && <span className="text-[14px] text-[var(--fg-muted)]">{value}</span>}
      {!hideChevron && (
        <ChevronRight
          className="h-[18px] w-[18px] text-[var(--fg-faint)] transition-transform duration-200 group-hover:translate-x-0.5"
          strokeWidth={1.6}
        />
      )}
    </button>
  );
}

function ChoiceView<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: T; label: string; desc: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <>
      <h1 className="font-display px-1 pb-6 pt-3 text-[30px] font-semibold leading-tight text-[var(--fg)]">
        {title}
      </h1>
      <div className="glass flex flex-col overflow-hidden rounded-[18px] [&>*+*]:border-t [&>*+*]:border-[var(--line)]">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="flex min-h-[64px] w-full items-center gap-4 px-4 text-left transition-colors duration-200 hover:bg-[var(--surface-hover)]"
              style={
                active
                  ? { background: "var(--choice-active-bg)" }
                  : undefined
              }
            >
              <span
                aria-hidden
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                style={{
                  borderColor: active
                    ? "var(--accent-3)"
                    : "var(--choice-ring)",
                }}
              >
                {active && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: "linear-gradient(135deg, var(--accent-3), var(--accent-2))" }}
                  />
                )}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] text-[var(--fg)]">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-[13px] text-[var(--fg-muted)]">
                  {opt.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function AboutView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-16 pt-10 text-center">
      <AceMateLogo size={80} glow />
      <h1 className="font-display mt-8 text-[30px] font-semibold text-[var(--fg)]">AceMate</h1>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">Version 1.0</p>
      <p className="mt-6 max-w-xs text-[15px] text-[var(--fg-muted)]">A calm place to ask, study, practice and create.</p>
    </div>
  );
}
