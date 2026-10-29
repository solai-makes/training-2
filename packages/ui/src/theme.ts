import { ref } from "vue";
import { h } from "./language.ts";

const stored = localStorage.getItem("solaistore.theme");
const dark = ref(
  stored
    ? stored === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches,
);
function update() {
  document.documentElement.dataset.theme = dark.value ? "dark" : "light";
  document.documentElement.style.colorScheme = dark.value ? "dark" : "light";
}
update();
window.addEventListener("storage", (event) => {
  if (event.key === "solaistore.theme") {
    dark.value = event.newValue === "dark";
    update();
  }
});
export function themeToggle() {
  return h(
    "button",
    {
      type: "button",
      class: "theme-toggle",
      "aria-label": dark.value ? "Switch to light mode" : "Switch to dark mode",
      "aria-pressed": dark.value,
      onClick: () => {
        dark.value = !dark.value;
        localStorage.setItem("solaistore.theme", dark.value ? "dark" : "light");
        update();
      },
    },
    dark.value ? "☀ Light" : "☾ Dark",
  );
}
