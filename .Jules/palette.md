## 2024-05-17 - Native PyQt6 Accessibility
**Learning:** ARIA properties cannot be directly applied to PyQt6 native apps; `setAccessibleName` and `setToolTip` are the Qt equivalents for screen reader support and tooltip hover explanations.
**Action:** Always map web-based a11y principles to the correct GUI toolkit API when working in native desktop applications (`setAccessibleName` instead of `aria-label`).
