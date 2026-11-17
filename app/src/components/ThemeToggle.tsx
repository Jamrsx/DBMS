import { Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { useGlass, useTheme, type ThemeChoice } from "../lib/theme";
import { COMPUTER, isMac } from "../lib/os";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Light / Dark / System segmented control; a radio group for keyboard and screen readers. */
export function ThemeToggle() {
  const [choice, setChoice] = useTheme();
  return (
    <div className="theme-picker">
      <fieldset className="theme-toggle">
        <legend className="visually-hidden">Theme</legend>
        {OPTIONS.map(({ value, label, Icon }) => (
          <label key={value} className="theme-option" title={`${label} theme`}>
            <input
              type="radio"
              name="theme"
              value={value}
              checked={choice === value}
              onChange={() => setChoice(value)}
            />
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <GlassToggle />
    </div>
  );
}

/** "Glass look": see-through panels over a blurred desktop, in whichever of light or dark is chosen. */
function GlassToggle() {
  const { on, reduced, setGlass } = useGlass();
  const settingName = isMac ? "Reduce transparency" : "Transparency effects";
  // Only worth a line when the OS is holding Glass back; otherwise the window itself shows it.
  const held = on && reduced;
  const hint = isMac
    ? `${settingName} is on in your ${COMPUTER}'s Accessibility settings, so Glass shows solid for now.`
    : `${settingName} is off in Windows settings, so Glass shows solid for now.`;
  return (
    <div className="glass-toggle">
      <label title="Glass look: see-through panels over your blurred desktop">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setGlass(e.target.checked)}
          aria-describedby={held ? "glass-hint" : undefined}
        />
        <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
        <span>Glass look</span>
      </label>
      {held && (
        <p id="glass-hint" className="glass-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
