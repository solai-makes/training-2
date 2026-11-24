export const profitLabels:Array<[string,string,string,string]>=[
['Blue: product revenue · Green: profit after recorded expenses','நீலம்: பொருள் வருவாய் · பச்சை: பதிவான செலவுகளுக்குப் பின் லாபம்','青：商品売上・緑：記録経費差引後利益','蓝色：商品收入 · 绿色：扣除已记费用后利润'],
['{0} units need a purchase cost. Profit is incomplete; a missing cost is not treated as zero.','{0} பொருட்களுக்கு கொள்முதல் செலவு தேவை. லாபம் முழுமையில்லை; விடுபட்ட செலவு பூஜ்ஜியமாகக் கருதப்படாது.','{0}点の仕入原価が未登録です。利益は未確定です。未登録原価はゼロと見なしません。','{0} 件商品缺少采购成本。利润尚不完整；缺失成本不按零计算。'],
['{0} paid orders · {1} refunded orders · {2} unpaid/unknown orders excluded · {3} simulated orders excluded.','செலுத்திய ஆர்டர்கள் {0} · திருப்பிய ஆர்டர்கள் {1} · செலுத்தாத/தெரியாத ஆர்டர்கள் {2} விலக்கு · உருவக ஆர்டர்கள் {3} விலக்கு.','支払済み{0}件・返金済み{1}件・未払い／不明{2}件を除外・模擬注文{3}件を除外。','已付款 {0} 单 · 已退款 {1} 单 · 排除未付款/未知 {2} 单 · 排除模拟 {3} 单。'],
['JPY estimate for orders confirmed in this period, using their current payment/refund status. Revenue excludes tax and delivery charges. Discounts and loyalty are deducted. Refunds remove revenue; restocked returns reverse product cost. Unsaleable returns retain their cost. Only entered expenses are deducted; this is not an accounting or tax report.','இந்தக் காலத்தில் உறுதியான ஆர்டர்களின் தற்போதைய கட்டண/திருப்புதல் நிலையைப் பயன்படுத்தும் JPY மதிப்பீடு. வருவாயில் வரி, விநியோகக் கட்டணம் இல்லை; தள்ளுபடி, புள்ளிச் சேமிப்பு கழிக்கப்படும். திருப்பிய தொகை வருவாயிலிருந்து நீக்கப்படும். மீண்டும் இருப்பில் சேர்ந்த பொருட்களின் செலவு மீட்கப்படும்; விற்க முடியாதவற்றின் செலவு தொடரும். பதிவான செலவுகள் மட்டுமே கழிக்கப்படும். இது கணக்கியல் அல்லது வரி அறிக்கை அல்ல.','対象期間に確定した注文の現在の支払・返金状況に基づく円建て概算です。税・送料を除外し、割引・ポイント利用を差し引きます。返金は売上から除外し、再入庫済み返品は原価を戻します。再販不可の返品原価は残ります。入力済み経費のみを控除します。会計・税務報告書ではありません。','按此期间确认订单的当前付款/退款状态估算，单位为日元。收入不含税费及运费，扣除优惠与积分抵扣。退款移除收入；已重新入库退货冲回成本，不可售退货保留成本。仅扣除已录入费用；本页不是会计或税务报表。'],
['Costs are private to staff. Choose when a cost applies; earlier sales require an earlier effective date. Later entries keep the previous cost history.','செலவுகள் ஊழியர்களுக்கு மட்டும். செலவு பொருந்தும் தேதியைத் தேர்ந்தெடுக்கவும்; பழைய விற்பனைக்கு முந்தைய தேதி தேவை. புதிய பதிவு பழைய செலவு வரலாற்றைப் பாதுகாக்கும்.','原価はスタッフ専用です。適用日を選択してください。過去の売上には過去の適用日が必要です。追加登録後も以前の原価履歴を保持します。','成本仅员工可见。请选择生效日期；较早销售需要较早的生效日期。新增记录保留原成本历史。'],
['Showing up to 40 matches. Search by product name or code; variants have their own costs.','அதிகபட்சம் 40 பொருட்கள். பெயர் அல்லது குறியீட்டால் தேடுங்கள். ஒவ்வொரு வகை மாற்றத்துக்கும் தனிச் செலவு உள்ளது.','最大40件を表示。商品名・コードで検索できます。バリエーションごとに原価を登録してください。','最多显示40条。按商品名或编码搜索；各规格单独设置成本。'],
['Record packaging, delivery fees, payment fees or other operating costs. Enter costs once.','பொதி, விநியோகம், கட்டணச் சேவை மற்றும் பிற இயக்கச் செலவுகளைப் பதிவு செய்யவும். ஒருமுறை மட்டும் உள்ளிடவும்.','梱包費・配送料・決済手数料などの経費を一度だけ記録してください。','记录包装、配送、支付手续费等经营费用。每项费用只录入一次。'],
['Enter a nonnegative whole-yen purchase cost.','பூஜ்ஜியம் அல்லது அதிகமான முழு யென் செலவை உள்ளிடவும்.','仕入原価は0以上の円整数で入力してください。','采购成本请输入不小于零的整数日元。'],
['Enter an expense label, date and positive whole-yen amount.','செலவு பெயர், தேதி மற்றும் நேர்மறை முழு யென் தொகையை உள்ளிடவும்.','経費名・日付・1円以上の整数金額を入力してください。','请输入费用说明、日期及正整数日元金额。'],
['Purchase cost saved.','கொள்முதல் செலவு சேமிக்கப்பட்டது.','仕入原価を保存しました。','采购成本已保存。'],
['Expense recorded.','செலவு பதிவானது.','経費を記録しました。','费用已记录。'],
['Amount (JPY)','தொகை (JPY)','金額（JPY）','金额（日元）'],
['Search','தேடு','検索','搜索'],['Save','சேமி','保存','保存']
];
profitLabels.push(
 ['Latest day','சமீபத்திய நாள்','直近の日付','最近一天'],
 ['Product costs','பொருள் செலவுகள்','商品原価','商品成本'],
 ['Blue: product revenue · Slate: profit after recorded expenses','நீலம்: பொருள் வருவாய் · சாம்பல் நீலம்: செலவுகளுக்குப் பின் லாபம்','青：商品売上・スレート：記録経費差引後利益','蓝色：商品收入 · 灰蓝色：扣除已录费用后利润'],
 ['Estimate 25% margin when cost is missing','செலவு இல்லாவிட்டால் 25% லாபத்தை மதிப்பிடு','原価未登録時は利益率25%で概算','缺少成本时按25%利润率估算'],
 ['Missing costs use a 25% estimated margin. Saved costs take priority; recorded expenses are deducted.','செலவு இல்லாத பொருட்களுக்கு 25% லாப மதிப்பீடு. சேமித்த செலவுகளுக்கு முன்னுரிமை; பதிவான செலவுகள் கழிக்கப்படும்.','未登録原価は利益率25%で概算します。登録原価を優先し、記録済み経費を差し引きます。','未录入成本时按25%利润率估算；优先采用已保存成本，并扣除已录入费用。'],
 ['Estimated units','மதிப்பிட்ட எண்ணிக்கை','概算対象数量','估算数量'],
 ['Includes estimates','மதிப்பீடுகள் உள்ளன','概算を含む','包含估算'],
 ['25% default margin','இயல்புநிலை லாபம் 25%','標準利益率25%','默认利润率25%']
);
