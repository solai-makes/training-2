import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
} from "vue";
import { h, t, locale } from "../../../packages/ui/src/language.ts";
import { money } from "../../../packages/ui/src/storefront.ts";
import { revenueGeometry, revenueScaleMaximum } from "./chart-layout.ts";
type Day = { day: string; revenue: number; orders: number };
export const RevenueChart = defineComponent({
  props: {
    daily: { type: Array as PropType<Day[]>, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  setup(props) {
    const selected = ref<number | null>(null),
      host = ref<HTMLElement | null>(null),
      width = ref(680);
    let observer: ResizeObserver | undefined,
      frame = 0,
      pendingIndex: number | null = null;
    const geometry = computed(() => {
      const values = props.daily.map((day) => day.revenue),
        maximum = revenueScaleMaximum(values);
      return revenueGeometry(
        values,
        Array.from({ length: 4 }, (_, i) => money(maximum * (1 - i / 3))),
        width.value,
      );
    });
    const dateLabels = computed(() => {
      const formatter = new Intl.DateTimeFormat(locale(), {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      return props.daily.map((day) =>
        formatter.format(new Date(day.day + "T12:00:00Z")),
      );
    });
    const renderPoints = computed(() =>
      geometry.value.points.map((point, index) => ({
        ...point,
        day: props.daily[index],
        dateLabel: dateLabels.value[index],
        ariaLabel:
          dateLabels.value[index] +
          ": " +
          money(props.daily[index].revenue) +
          " · " +
          props.daily[index].orders +
          " " +
          t("Orders"),
      })),
    );
    function select(index: number | null) {
      pendingIndex = index;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        selected.value = pendingIndex;
        frame = 0;
      });
    }
    function clear() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pendingIndex = null;
      selected.value = null;
    }
    function hover(event: PointerEvent) {
      if (event.pointerType === "touch" || !props.daily.length) return;
      const svg = event.currentTarget as SVGSVGElement,
        box = svg.getBoundingClientRect(),
        g = geometry.value,
        x = ((event.clientX - box.left) / box.width) * g.width,
        y = ((event.clientY - box.top) / box.height) * g.height;
      if (
        x < g.left - 6 ||
        x > g.right + 6 ||
        y < g.top - 8 ||
        y > g.bottom + 8
      ) {
        clear();
        return;
      }
      select(
        Math.max(
          0,
          Math.min(
            props.daily.length - 1,
            Math.round(
              ((x - g.left) / (g.right - g.left)) * (props.daily.length - 1),
            ),
          ),
        ),
      );
    }
    onMounted(() => {
      if (host.value) {
        width.value = host.value.clientWidth;
        observer = new ResizeObserver((entries) => {
          width.value = entries[0]?.contentRect.width ?? 680;
        });
        observer.observe(host.value);
      }
    });
    onBeforeUnmount(() => {
      clear();
      observer?.disconnect();
    });
    return () => {
      const g = geometry.value,
        points = renderPoints.value,
        active = selected.value === null ? null : points[selected.value],
        readout = active ?? points.at(-1);
      return h("div", { class: "revenue-interactive", ref: host }, [
        h(
          "div",
          {
            class: "revenue-readout",
            "aria-live": "polite",
            "aria-atomic": true,
          },
          readout
            ? [
                h("div", [
                  h("small", active ? "Sales revenue" : "Latest day"),
                  h("strong", money(readout.day.revenue)),
                ]),
                h("div", [
                  h("small", readout.dateLabel),
                  h("span", `${readout.day.orders} ${t("Orders")}`),
                ]),
              ]
            : [h("span", "No sales yet")],
        ),
        h(
          "svg",
          {
            class: "revenue-chart",
            viewBox: `0 0 ${g.width} ${g.height}`,
            role: "group",
            "aria-label": t("Revenue trend"),
            onPointermove: hover,
            onPointerleave: clear,
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === "Escape") clear();
            },
          },
          [
            ...Array.from({ length: 4 }, (_, i) => {
              const y = g.top + (i * (g.bottom - g.top)) / 3;
              return h("g", [
                h("line", {
                  x1: g.left,
                  x2: g.right,
                  y1: y,
                  y2: y,
                  stroke: "var(--chart-grid)",
                  "stroke-dasharray": i === 3 ? undefined : "4 5",
                }),
                h(
                  "text",
                  {
                    x: g.left - 14,
                    y: y + 4,
                    "text-anchor": "end",
                    fill: "var(--chart-muted)",
                    "font-size": 12,
                  },
                  money(Math.round(g.maximum * (1 - i / 3))),
                ),
              ]);
            }),
            points.length
              ? h("polygon", {
                  points: `${g.left},${g.bottom} ${points.map((point) => `${point.x},${point.y}`).join(" ")} ${g.right},${g.bottom}`,
                  fill: "var(--chart-area)",
                })
              : null,
            h("polyline", {
              points: points.map((point) => `${point.x},${point.y}`).join(" "),
              fill: "none",
              stroke: "var(--chart-primary)",
              "stroke-width": 3,
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              class: "revenue-line",
            }),
            ...points.map(({ day, x, y, ariaLabel }, index) =>
              h("circle", {
                key: day.day,
                cx: x,
                cy: y,
                r: points.length > 40 ? 2 : 4,
                fill: "var(--chart-primary)",
                tabindex: 0,
                role: "button",
                "aria-label": ariaLabel,
                onFocus: () => select(index),
                onBlur: clear,
                onClick: () => select(index),
                class: "revenue-point",
              }),
            ),
            active
              ? h("g", { "pointer-events": "none" }, [
                  h("line", {
                    x1: active.x,
                    x2: active.x,
                    y1: g.top,
                    y2: g.bottom,
                    stroke: "var(--chart-primary)",
                    "stroke-dasharray": "3 5",
                    opacity: 0.55,
                  }),
                  h("circle", {
                    cx: active.x,
                    cy: active.y,
                    r: 10,
                    fill: "var(--chart-primary)",
                    opacity: 0.15,
                  }),
                  h("circle", {
                    cx: active.x,
                    cy: active.y,
                    r: 5,
                    fill: "var(--chart-surface)",
                    stroke: "var(--chart-primary)",
                    "stroke-width": 3,
                  }),
                ])
              : null,
            h(
              "text",
              {
                x: g.left,
                y: g.bottom + 32,
                "font-size": 12,
                fill: "var(--chart-muted)",
              },
              props.from,
            ),
            props.to !== props.from
              ? h(
                  "text",
                  {
                    x: g.right,
                    y: g.bottom + 32,
                    "text-anchor": "end",
                    "font-size": 12,
                    fill: "var(--chart-muted)",
                  },
                  props.to,
                )
              : null,
          ],
        ),
      ]);
    };
  },
});
