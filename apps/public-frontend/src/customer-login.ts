import "./customer-login.css";
import { ref } from "vue";
import type { VNode } from "vue";
import { h } from "../../../packages/ui/src/language.ts";
type Session = { token: string; name: string; guest: boolean };
export function useCustomerLogin(accept: (session: Session) => Promise<void>) {
  const channel = ref<"email" | "sms">("email"),
    identifier = ref(""),
    name = ref(""),
    code = ref(""),
    challenge = ref(""),
    busy = ref(false),
    error = ref(""),
    message = ref(""),
    password = ref(false),
    configuration = ref<{ email: boolean; sms: boolean } | null>(null);
  async function api(path: string, body?: unknown) {
    const response = await fetch("/api/auth" + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data?.message ?? "Sign-in could not be completed. Please retry.",
      );
    return data;
  }
  async function load() {
    try {
      configuration.value = await api("/config");
    } catch {
      configuration.value = { email: false, sms: false };
    }
  }
  async function run(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await action();
    } catch (failure) {
      error.value = (failure as Error).message;
    } finally {
      busy.value = false;
    }
  }
  async function send() {
    await run(async () => {
      const data = await api("/otp/request", {
        channel: channel.value,
        identifier: identifier.value,
        name: name.value,
      });
      challenge.value = data.challengeId;
      code.value = "";
      message.value = "Verification code sent. Check your email or phone.";
    });
  }
  async function verify() {
    await run(async () => {
      await accept(
        await api("/otp/verify", {
          challengeId: challenge.value,
          code: code.value,
        }),
      );
      challenge.value = "";
      code.value = "";
      message.value = "";
    });
  }
  const button = (label: string, action: () => void, kind = "secondary") =>
    h(
      "button",
      {
        type: "button",
        class: `btn ${kind}`,
        disabled: busy.value,
        onClick: action,
      },
      label,
    );
  const field = (
    label: string,
    value: string,
    set: (value: string) => void,
    props: Record<string, unknown> = {},
  ) =>
    h("label", { class: "field" }, [
      h("span", label),
      h("input", {
        value,
        required: true,
        ...props,
        onInput: (event: Event) =>
          set((event.target as HTMLInputElement).value),
      }),
    ]);
  return {
    load,
    view: (legacy: () => VNode[]) =>
      password.value
        ? [
            ...legacy(),
            button("Use email or phone OTP", () => {
              password.value = false;
            }),
          ]
        : [
            h("span", { class: "eyebrow" }, "YOUR SOLAISTORE ACCOUNT"),
            h("h2", { id: "dialog-title" }, "Sign in or create an account"),
            h(
              "p",
              { class: "muted" },
              "Verify your email or phone. Your orders and saved addresses stay with your account.",
            ),
            button("Continue as guest", () => {
              void run(async () => {
                await accept(await api("/guest", {}));
              });
            }, "text"),
            !challenge.value
              ? h("div", { class: "tools-actions" }, [
                  button("Email OTP", () => {
                    channel.value = "email";
                    error.value = "";
                  }),
                  button("Phone OTP", () => {
                    channel.value = "sms";
                    error.value = "";
                  }),
                ])
              : null,
            configuration.value && !configuration.value[channel.value]
              ? h(
                  "p",
                  { class: "demo-notice", role: "status" },
                  "Real OTP delivery is not configured for this channel yet. Please contact the store owner.",
                )
              : null,
            h(
              "form",
              {
                onSubmit: (event: Event) => {
                  event.preventDefault();
                  void (challenge.value ? verify() : send());
                },
              },
              [
                !challenge.value
                  ? [
                      field(
                        "Your full name",
                        name.value,
                        (v) => {
                          name.value = v;
                        },
                        { autocomplete: "name", maxlength: 100 },
                      ),
                      field(
                        channel.value === "email"
                          ? "Email address"
                          : "Phone number with country code",
                        identifier.value,
                        (v) => {
                          identifier.value = v;
                        },
                        {
                          type: channel.value === "email" ? "email" : "tel",
                          autocomplete:
                            channel.value === "email" ? "email" : "tel",
                          placeholder:
                            channel.value === "email"
                              ? "you@example.com"
                              : "+919876543210",
                          maxlength: 254,
                        },
                      ),
                    ]
                  : [
                      h("p", identifier.value),
                      field(
                        "Verification code",
                        code.value,
                        (v) => {
                          code.value = v.replace(/\D/g, "");
                        },
                        {
                          inputmode: "numeric",
                          autocomplete: "one-time-code",
                          minlength: 4,
                          maxlength: 10,
                        },
                      ),
                    ],
                error.value
                  ? h("p", { class: "form-error", role: "alert" }, error.value)
                  : null,
                message.value
                  ? h("p", { role: "status" }, message.value)
                  : null,
                h(
                  "button",
                  {
                    type: "submit",
                    class: "btn primary full",
                    disabled:
                      busy.value ||
                      (!challenge.value &&
                        !configuration.value?.[channel.value]),
                  },
                  busy.value
                    ? "Please wait…"
                    : challenge.value
                      ? "Verify and continue"
                      : "Send verification code",
                ),
              ],
            ),
            challenge.value
              ? button("Use another email or phone / resend", () => {
                  challenge.value = "";
                  code.value = "";
                  message.value = "";
                  error.value = "";
                })
              : null,
            h(
              "p",
              { class: "fine-print" },
              "Codes expire after 10 minutes. Wait at least 60 seconds before requesting another code.",
            ),
            h(
              "p",
              { class: "fine-print" },
              "Guest access lasts 24 hours in this browser. Sign out ends access to guest orders. Use a verified account to keep your history.",
            ),
            button(
              "Password / staff login",
              () => {
                password.value = true;
              },
              "text",
            ),
          ],
  };
}
