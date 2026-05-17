## 2026-05-17 - Keyboard-First Console Driving
**Learning:** In highly stylized, high-density dashboard layouts mimicking terminal systems, users inherently default to keyboard navigation patterns rather than cursor clicks. Forcing mouse dependency on standard input fields breaks immersion and lowers task generation efficiency.
**Action:** Always map primary execution inputs directly to command modifier combos (Ctrl+Enter or Enter) upon initial DOM mount, ensuring interactive indicators match disabled state changes natively.

## 2026-05-17 - Native PyQt6 Accessibility vs HTML ARIA
**Learning:** PyQt6 native widgets use `setAccessibleName()` and `setToolTip()` — not HTML `aria-label` / `aria-describedby`. Screen readers on Windows (NVDA, Narrator) read `accessibleName` from the Qt accessibility bridge. Dynamic state changes (mute/unmute) require updating both `setText()` and `setAccessibleName()` + `setToolTip()` inside the same state-styling method so the accessible tree stays in sync with the visual state.
**Action:** For every stateful button in the PyQt6 HUD, call `setAccessibleName()` and `setToolTip()` inside the same method that updates text and stylesheet — never set them once at construction time and forget them.
