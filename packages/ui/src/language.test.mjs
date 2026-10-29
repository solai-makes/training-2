import assert from "node:assert/strict";
import { test } from "node:test";
import { h, language, locale, t } from "./language.ts";
import { completeLabels } from "./language-full.ts";
import { date, money } from "./storefront.ts";
test("all supported locales translate new UI labels and dynamic placeholders", ()=>{
    const previous = language.value;
    try {
        for (const [lang, index] of [
            [
                "ta",
                1
            ],
            [
                "ja",
                2
            ],
            [
                "zh",
                3
            ]
        ]){
            language.value = lang;
            for (const row of completeLabels){
                const sample = row[0].replace(/\{(\d+)\}/g, (_, n)=>`ZQ${n}X`);
                const expected = row[index].replace(/\{(\d+)\}/g, (_, n)=>`ZQ${n}X`);
                assert.equal(t(sample), expected, `${lang}: ${row[0]}`);
            }
        }
    } finally{
        language.value = previous;
    }
});
test("switching locale preserves form values and references while updating visible labels", ()=>{
    const previous = language.value;
    try {
        for (const lang of [
            "ta",
            "ja",
            "zh"
        ]){
            language.value = lang;
            assert.notEqual(t("2 of 4 products selected"), "2 of 4 products selected");
            assert.ok(t("Coupon (10%)").includes("10"));
            assert.notEqual(t("01h 20m 30s"), "01h 20m 30s");
            for (const data of [
                "SS-012345ABCDEF",
                "santhoshhere341",
                "My custom product 42"
            ])assert.equal(t(data), data);
            const option = h("option", {
                value: "Damaged or defective"
            }, "Damaged or defective");
            assert.equal(option.props?.value, "Damaged or defective");
            assert.notEqual(option.children, "Damaged or defective");
            const input = h("input", {
                value: "Home",
                placeholder: "Enter coupon code",
                "aria-label": "Tracking reference number"
            });
            assert.equal(input.props?.value, "Home");
            assert.equal(input.props?.placeholder, t("Enter coupon code"));
            assert.equal(input.props?.["aria-label"], t("Tracking reference number"));
            assert.equal(t("  Copy reference  "), `  ${t("Copy reference")}  `);
        }
        language.value = "en";
        assert.equal(t("Track by reference"), "Track by reference");
    } finally{
        language.value = previous;
    }
});
test("dates and currency follow the selected UI locale", ()=>{
    const previous = language.value;
    try {
        for (const lang of [
            "en",
            "ta",
            "ja",
            "zh"
        ]){
            language.value = lang;
            assert.equal(money(22400), new Intl.NumberFormat(locale(), {
                style: "currency",
                currency: "JPY",
                maximumFractionDigits: 0
            }).format(22400));
            const value = "2026-10-28T01:00:00Z";
            assert.equal(date(value), new Date(value).toLocaleString(locale(), {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }));
        }
    } finally{
        language.value = previous;
    }
});
