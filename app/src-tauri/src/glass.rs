//! "Glass look" (see app/src/lib/theme.ts): the main window's own see-through blur.
//!
//! - macOS 26+: Apple's Liquid Glass; macOS 13-15: the classic sidebar vibrancy (Tauri falls back).
//! - Windows 10/11: Acrylic (a live blur of what's behind), tinted light or dark; Mica if Acrylic
//!   isn't available; otherwise Glass stays solid.
//!
//! The main window is created transparent (tauri.conf.json); with Glass off, or on a system that
//! can't blur, the page paints its usual solid background, so the window looks exactly as before.

use serde::Serialize;
use tauri::WebviewWindow;

/// What the page should show.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct GlassState {
    /// The window is blurring what's behind it, so the page may go see-through.
    pub applied: bool,
    /// The OS asks for less transparency (macOS Reduce transparency), so stay solid.
    pub reduced: bool,
}

/// Only the main window is created transparent; the terminal and other side windows stay solid.
pub fn glass_capable(label: &str) -> bool {
    label == "main"
}

/// Turns the window blur on (light or dark) or off. Runs on the main thread (a sync command).
pub fn set(window: &WebviewWindow, on: bool, dark: bool) -> GlassState {
    let reduced = reduce_transparency();
    if !glass_capable(window.label()) {
        return GlassState { applied: false, reduced };
    }
    let applied = on && !reduced && apply(window, dark);
    if !applied {
        clear(window);
    }
    GlassState { applied, reduced }
}

#[cfg(target_os = "macos")]
fn apply(window: &WebviewWindow, dark: bool) -> bool {
    use tauri::window::{Effect, EffectState, EffectsBuilder};
    // The material follows the window's appearance, so match it to Glass Light / Glass Dark.
    let _ = window.set_theme(Some(if dark { tauri::Theme::Dark } else { tauri::Theme::Light }));
    window
        .set_effects(
            EffectsBuilder::new()
                .effects([Effect::LiquidGlassRegular, Effect::Sidebar])
                .state(EffectState::FollowsWindowActiveState)
                .build(),
        )
        .is_ok()
}

#[cfg(target_os = "macos")]
fn clear(window: &WebviewWindow) {
    let _ = window.set_effects(None);
    // Back to following the Mac's own light/dark for the title bar.
    let _ = window.set_theme(None);
}

#[cfg(target_os = "macos")]
fn reduce_transparency() -> bool {
    objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceTransparency()
}

#[cfg(windows)]
fn apply(window: &WebviewWindow, dark: bool) -> bool {
    // Acrylic: a live blur of whatever is behind the window, so the desktop really shows through
    // (Mica only borrows a faint tint of the wallpaper). The tint keeps text readable on any
    // wallpaper. Called directly (not through Tauri's set_effects) to learn whether it took.
    clear(window);
    let tint = if dark { (16, 18, 24, 150) } else { (238, 241, 246, 150) };
    if window_vibrancy::apply_acrylic(window, Some(tint)).is_ok() {
        // Title bar to match Glass Light / Glass Dark.
        let _ = window.set_theme(Some(if dark { tauri::Theme::Dark } else { tauri::Theme::Light }));
        return true;
    }
    // Older Windows without Acrylic: Mica if it has it, otherwise the page stays solid.
    window_vibrancy::apply_mica(window, Some(dark)).is_ok()
}

#[cfg(windows)]
fn clear(window: &WebviewWindow) {
    let _ = window_vibrancy::clear_acrylic(window);
    let _ = window_vibrancy::clear_mica(window);
    // Back to following Windows' own light/dark for the title bar.
    let _ = window.set_theme(None);
}

#[cfg(windows)]
fn reduce_transparency() -> bool {
    // Windows' "Transparency effects" switch reaches the page as prefers-reduced-transparency.
    false
}

#[cfg(not(any(target_os = "macos", windows)))]
fn apply(_window: &WebviewWindow, _dark: bool) -> bool {
    false
}

#[cfg(not(any(target_os = "macos", windows)))]
fn clear(_window: &WebviewWindow) {}

#[cfg(not(any(target_os = "macos", windows)))]
fn reduce_transparency() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_main_window_can_be_glass() {
        assert!(glass_capable("main"));
        assert!(!glass_capable("terminal-1"));
        assert!(!glass_capable("nexhost-panel"));
    }

    #[test]
    fn state_reads_as_plain_json_for_the_page() {
        let json = serde_json::to_string(&GlassState { applied: true, reduced: false }).unwrap();
        assert_eq!(json, r#"{"applied":true,"reduced":false}"#);
    }
}
