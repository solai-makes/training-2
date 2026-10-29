import { computed, ref } from "vue";
import { h } from "../../../packages/ui/src/language.ts";
export function useProductPhoto() {
  const data = ref<string | null | undefined>(),
    existing = ref(""),
    processing = ref(false),
    error = ref(""),
    original = ref<HTMLImageElement | null>(null),
    rotation = ref(0);
  const preview = computed(() =>
    data.value === undefined ? existing.value : (data.value ?? ""),
  );
  function reset(url = "") {
    data.value = undefined;
    existing.value = url;
    original.value = null;
    rotation.value = 0;
    error.value = "";
  }
  async function render() {
    const image = original.value;
    if (!image) return;
    const side = Math.max(image.naturalWidth, image.naturalHeight),
      scale = Math.min(1, 1200 / side),
      quarter = rotation.value % 180 !== 0;
    const canvas = document.createElement("canvas");
    const width = Math.round(image.naturalWidth * scale),
      height = Math.round(image.naturalHeight * scale);
    canvas.width = quarter ? height : width;
    canvas.height = quarter ? width : height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not prepare this photo.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation.value * Math.PI) / 180);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    let result = canvas.toDataURL("image/jpeg", 0.86);
    if (result.length > 1100000) result = canvas.toDataURL("image/jpeg", 0.65);
    if (result.length > 1100000)
      throw new Error("This photo is too detailed. Choose a smaller photo.");
    data.value = result;
  }
  async function load(file?: File) {
    if (!file) return;
    error.value = "";
    processing.value = true;
    let url = "";
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPEG, PNG or WebP photo.");
      if (file.size > 10000000)
        throw new Error("Choose a photo smaller than 10 MB.");
      url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 40000000)
        throw new Error("Choose a photo under 40 megapixels.");
      original.value = image;
      rotation.value = 0;
      await render();
    } catch (failure) {
      error.value = (failure as Error).message;
    } finally {
      if (url) URL.revokeObjectURL(url);
      processing.value = false;
    }
  }
  async function rotate() {
    error.value = "";
    processing.value = true;
    try {
      if (!original.value && preview.value) {
        const image = new Image();
        image.src = preview.value;
        await image.decode();
        original.value = image;
      }
      rotation.value = (rotation.value + 90) % 360;
      await render();
    } catch (failure) {
      error.value = (failure as Error).message;
    } finally {
      processing.value = false;
    }
  }
  function editor(disabled: boolean) {
    const locked = disabled || processing.value;
    return h(
      "section",
      { class: "photo-editor", "aria-label": "Product photo" },
      [
        h(
          "div",
          { class: "photo-editor-preview" },
          preview.value
            ? h("img", { src: preview.value, alt: "Product photo preview" })
            : h("span", "No photo yet"),
        ),
        h("div", { class: "photo-editor-controls" }, [
          h("h3", "Product photo"),
          h(
            "p",
            "Show customers the actual product. JPEG, PNG or WebP, up to 10 MB. Photos are resized automatically.",
          ),
          h("label", { class: "photo-upload" }, [
            h(
              "span",
              processing.value
                ? "Preparing photo…"
                : preview.value
                  ? "Replace photo"
                  : "Upload photo",
            ),
            h("input", {
              type: "file",
              accept: "image/jpeg,image/png,image/webp",
              "aria-label": "Upload product photo",
              disabled: locked,
              onChange: (event: Event) => {
                const input = event.target as HTMLInputElement;
                void load(input.files?.[0]);
                input.value = "";
              },
            }),
          ]),
          preview.value
            ? h(
                "button",
                {
                  type: "button",
                  class: "btn secondary",
                  disabled: locked,
                  onClick: () => void rotate(),
                },
                "Rotate 90°",
              )
            : null,
          preview.value
            ? h(
                "button",
                {
                  type: "button",
                  class: "btn text",
                  disabled: locked,
                  onClick: () => {
                    data.value = null;
                    original.value = null;
                    rotation.value = 0;
                    error.value = "";
                  },
                },
                "Remove photo",
              )
            : null,
          error.value
            ? h("p", { class: "form-error", role: "alert" }, error.value)
            : null,
          h(
            "small",
            "Photo changes are applied when you save the product. Cancel keeps the saved photo.",
          ),
        ]),
      ],
    );
  }
  return { data, processing, error, reset, editor };
}
