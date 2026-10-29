import { defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import { h } from "../../../packages/ui/src/language.ts";
import { artSvg, iconSvg } from "../../../packages/ui/src/storefront.ts";
import "./shop-hero.css";

const slides = [
  {
    eyebrow: "THE EVERYDAY, UPGRADED",
    title: ["Good finds.", "Better everyday."],
    description:
      "Thoughtful essentials for your home, your work, and everything in between.",
    product: "Headphones",
    category: "Tech & audio",
    button: "Discover tech & audio",
    caption: "Small upgrades. Better listening.",
    tone: "sage",
  },
  {
    eyebrow: "MAKE YOUR SPACE YOUR OWN",
    title: ["A calmer home.", "A little more you."],
    description:
      "Find considered lighting, comfortable textures, and useful details for every corner.",
    product: "Desk Lamp",
    category: "Home & living",
    button: "Explore home & living",
    caption: "Warm light. Thoughtful living.",
    tone: "sand",
  },
  {
    eyebrow: "READY FOR WHEREVER",
    title: ["Pack light.", "Go a little further."],
    description:
      "Practical bags and everyday companions, ready for your commute and your next adventure.",
    product: "Canvas Backpack",
    category: "Everyday carry",
    button: "Shop everyday carry",
    caption: "Made for days on the move.",
    tone: "blue",
  },
  {
    eyebrow: "A MOMENT FOR YOURSELF",
    title: ["Move more.", "Feel your best."],
    description:
      "Make room for good habits with wellness essentials that fit into your everyday routine.",
    product: "Yoga Mat",
    category: "Wellness",
    button: "Find your wellness essentials",
    caption: "Your pace. Your everyday ritual.",
    tone: "lilac",
  },
];
export const ShopHero = defineComponent({
  emits: { explore: (category: string) => !!category },
  setup(_props, { emit }) {
    const index = ref(0),
      paused = ref(matchMedia("(prefers-reduced-motion: reduce)").matches),
      hovered = ref(false),
      focused = ref(false);
    let timer: ReturnType<typeof setInterval> | undefined;
    const change = (next: number) => {
      index.value = (next + slides.length) % slides.length;
    };
    onMounted(() => {
      timer = setInterval(() => {
        if (
          !paused.value &&
          !hovered.value &&
          !focused.value &&
          document.visibilityState === "visible"
        )
          change(index.value + 1);
      }, 6000);
    });
    onBeforeUnmount(() => clearInterval(timer));
    return () => {
      const slide = slides[index.value];
      return h(
        "section",
        {
          class: `hero hero-carousel hero-tone-${slide.tone}`,
          role: "region",
          "aria-roledescription": "carousel",
          "aria-label": "Featured collections",
          onMouseenter: () => {
            hovered.value = true;
          },
          onMouseleave: () => {
            hovered.value = false;
          },
          onFocusin: () => {
            focused.value = true;
          },
          onFocusout: (event: FocusEvent) => {
            focused.value = (event.currentTarget as HTMLElement).contains(
              event.relatedTarget as Node | null,
            );
          },
        },
        [
          h(
            "div",
            {
              class: "hero-slide",
              key: index.value,
              role: "group",
              "aria-roledescription": "slide",
              "aria-label": `${index.value + 1} of ${slides.length}`,
            },
            [
              h("div", { class: "hero-copy" }, [
                h("span", { class: "eyebrow" }, slide.eyebrow),
                h("h1", [slide.title[0], h("br"), slide.title[1]]),
                h("p", slide.description),
                h(
                  "button",
                  {
                    class: "btn dark",
                    type: "button",
                    onClick: () => emit("explore", slide.category),
                  },
                  [
                    h("span", { class: "icon", innerHTML: iconSvg("arrow") }),
                    slide.button,
                  ],
                ),
                h("div", { class: "hero-caption" }, [
                  h("span", { class: "tiny-dot" }),
                  "Real stock. Simple checkout. Less guesswork.",
                ]),
              ]),
              h("div", { class: "hero-visual" }, [
                h("span", { class: "orbit orbit-one" }),
                h("span", { class: "orbit orbit-two" }),
                h("div", {
                  class: "hero-product",
                  innerHTML: artSvg(
                    { name: slide.product, description: slide.category },
                    true,
                  ),
                }),
                h("div", { class: "float-label" }, [
                  h("span", { class: "icon", innerHTML: iconSvg("check") }),
                  h("span", [
                    h("strong", slide.category),
                    h("small", slide.caption),
                  ]),
                ]),
              ]),
            ],
          ),
          h("div", { class: "hero-carousel-controls" }, [
            h(
              "div",
              {
                class: "hero-dots",
                "aria-label": "Choose featured collection",
              },
              slides.map((item, i) =>
                h(
                  "button",
                  {
                    type: "button",
                    class: i === index.value ? "active" : "",
                    "aria-label": `Show ${item.category}, slide ${i + 1}`,
                    "aria-pressed": i === index.value,
                    onClick: () => change(i),
                  },
                  h("span"),
                ),
              ),
            ),
            h(
              "span",
              { class: "hero-slide-count", "aria-hidden": "true" },
              `0${index.value + 1} / 04`,
            ),
            h(
              "button",
              {
                type: "button",
                class: "hero-rotation-toggle",
                "aria-label": paused.value
                  ? "Play banner rotation"
                  : "Pause banner rotation",
                "aria-pressed": paused.value,
                onClick: () => {
                  paused.value = !paused.value;
                },
              },
              paused.value ? "▶ Play" : "Ⅱ Pause",
            ),
          ]),
        ],
      );
    };
  },
});
