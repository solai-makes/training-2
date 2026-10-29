import { completeLabels } from "./language-full.ts";
import { extraLabels } from "./language-extra.ts";
import { h as vueH, ref, watch } from "vue";
export type Language = "en" | "ta" | "ja" | "zh";
const incoming =
  typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("lang");
const saved =
  typeof localStorage === "undefined"
    ? "en"
    : localStorage.getItem("solaistore.language");
export const language = ref<Language>(
  ["en", "ta", "ja", "zh"].includes(incoming ?? "")
    ? (incoming as Language)
    : ["en", "ta", "ja", "zh"].includes(saved ?? "")
      ? (saved as Language)
      : "en",
);
watch(
  language,
  (value) => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = value;
      localStorage.setItem("solaistore.language", value);
    }
  },
  { immediate: true },
);
// Catalog names, addresses, order references and customer-entered text are preserved.
const rows: Array<[string, string, string, string]> = [
  [
    "Discover your next favorite",
    "உங்கள் அடுத்த விருப்பத்தைக் கண்டறியுங்கள்",
    "次のお気に入りを見つけよう",
    "发现您的下一件心仪好物",
  ],
  [
    "Search for your next good find…",
    "உங்கள் அடுத்த விருப்பப் பொருளைத் தேடுங்கள்…",
    "お気に入りの商品を検索…",
    "搜索您的下一件好物…",
  ],
  ["In stock only", "இருப்பில் உள்ளவை மட்டும்", "在庫ありのみ", "仅显示有货商品"],
  [
    "Sort: Featured",
    "வரிசை: சிறப்புத் தேர்வு",
    "並び替え：おすすめ",
    "排序：精选",
  ],
  [
    "Price: Low to high",
    "விலை: குறைவிலிருந்து அதிகம்",
    "価格の安い順",
    "价格从低到高",
  ],
  [
    "Price: High to low",
    "விலை: அதிகத்திலிருந்து குறைவு",
    "価格の高い順",
    "价格从高到低",
  ],
  ["Name: A to Z", "பெயர்: A முதல் Z வரை", "商品名順", "名称排序"],
  ["Hello, welcome", "வணக்கம், வருக", "ようこそ", "您好，欢迎光临"],
  ["Almost gone", "இருப்பு குறைகிறது", "残りわずか", "库存不多"],
  [
    "Currently unavailable",
    "தற்போது கிடைக்கவில்லை",
    "現在お取り扱いできません",
    "暂时无货",
  ],
  [
    "A practical everyday essential from the Solaistore collection.",
    "சோலைஸ்டோர் தொகுப்பிலிருந்து அன்றாடத்திற்கான பயனுள்ள பொருள்.",
    "Solaistoreが選んだ、毎日に役立つアイテム。",
    "Solaistore精选的实用日常好物。",
  ],
  [
    "A thoughtfully selected essential with practical details and an everyday design.",
    "அன்றாடப் பயன்பாட்டிற்காகக் கவனமாகத் தேர்ந்தெடுக்கப்பட்ட பொருள்.",
    "使いやすさとデザインにこだわった日常の必需品。",
    "兼具实用细节与日常设计的精选必需品。",
  ],
  [
    "Thoughtful design, everyday comfort. A simple upgrade for the way you live.",
    "சிந்தனையுடன் வடிவமைக்கப்பட்ட அன்றாட வசதி. உங்கள் வாழ்க்கைக்கு ஓர் எளிய மேம்பாடு.",
    "考え抜かれたデザインと毎日の快適さ。暮らしを少し豊かに。",
    "用心设计，日常舒适。为生活带来简单升级。",
  ],
  ["50% OFF", "50% தள்ளுபடி", "50%OFF", "五折优惠"],
  [
    "Stock updates every 4s",
    "இருப்பு ஒவ்வொரு 4 வினாடிக்கும் புதுப்பிக்கப்படும்",
    "在庫は4秒ごとに更新",
    "库存每4秒更新",
  ],
  ["Your full name", "உங்கள் முழுப் பெயர்", "氏名を入力", "请输入姓名"],
  [
    "Email or username",
    "மின்னஞ்சல் அல்லது பயனர்பெயர்",
    "メールアドレスまたはユーザー名",
    "邮箱或用户名",
  ],
  ["Delivery address", "விநியோக முகவரி", "お届け先住所", "收货地址"],
  ["Your city", "உங்கள் நகரம்", "市区町村", "您所在的城市"],
  ["Review your order", "உங்கள் ஆர்டரைச் சரிபாருங்கள்", "ご注文を確認", "核对订单"],
  [
    "Your bag of good finds.",
    "உங்கள் விருப்பப் பொருட்களின் கூடை.",
    "お気に入りをカートに。",
    "您的好物购物车。",
  ],
  [
    "Your cart is empty",
    "உங்கள் கூடை காலியாக உள்ளது",
    "カートは空です",
    "您的购物车是空的",
  ],
  [
    "Your cart is empty.",
    "உங்கள் கூடை காலியாக உள்ளது.",
    "カートは空です。",
    "您的购物车是空的。",
  ],
  [
    "Your order is confirmed.",
    "உங்கள் ஆர்டர் உறுதிசெய்யப்பட்டது.",
    "ご注文が確定しました。",
    "您的订单已确认。",
  ],
  ["Order confirmed", "ஆர்டர் உறுதிசெய்யப்பட்டது", "注文確定", "订单已确认"],
  ["Download PDF", "PDF பதிவிறக்கு", "PDFをダウンロード", "下载PDF"],
  [
    "Download PDF receipt",
    "PDF ரசீதைப் பதிவிறக்கு",
    "PDF領収書をダウンロード",
    "下载PDF收据",
  ],
  [
    "Demo completed. No money charged; receipt ready.",
    "மாதிரி முடிந்தது. பணம் பிடிக்கப்படவில்லை; ரசீது தயார்.",
    "デモ完了。請求はありません。領収書を保存できます。",
    "演示已完成，未扣款，收据已就绪。",
  ],
  [
    "SOLAISTORE · DEMO ONLY",
    "சோலைஸ்டோர் · மாதிரி மட்டும்",
    "SOLAISTORE・デモ専用",
    "SOLAISTORE · 仅供演示",
  ],
  [
    "Use the supplied fictional card. Do not enter real card details.",
    "கொடுக்கப்பட்ட மாதிரி அட்டையைப் பயன்படுத்தவும். உண்மையான அட்டை விவரங்களை உள்ளிட வேண்டாம்.",
    "表示された架空カードを使用してください。実際のカード情報は入力しないでください。",
    "请使用提供的虚拟卡，不要输入真实银行卡信息。",
  ],
  [
    "Illustration only · not scannable · no payment destination",
    "மாதிரிப் படம் மட்டும் · ஸ்கேன் செய்ய முடியாது · கட்டண இலக்கு இல்லை",
    "イメージ画像・読み取り不可・送金先なし",
    "仅为示意图 · 无法扫码 · 无收款账户",
  ],
  [
    "Demo payment cancelled. Resume or cancel the saved order from Your orders.",
    "மாதிரிக் கட்டணம் ரத்தானது. உங்கள் ஆர்டர்களில் தொடரலாம் அல்லது ரத்து செய்யலாம்.",
    "デモ決済をキャンセルしました。注文履歴から再開または注文の取り消しができます。",
    "演示付款已取消，可在订单中继续或取消已保存订单。",
  ],
  [
    "Stock retail value",
    "இருப்பின் சில்லறை மதிப்பு",
    "在庫の小売価格評価額",
    "库存零售价值",
  ],
  [
    "Retail price × current stock",
    "சில்லறை விலை × தற்போதைய இருப்பு",
    "小売価格 × 現在の在庫",
    "零售价 × 当前库存",
  ],
  [
    "Auto-refresh every 4 seconds",
    "ஒவ்வொரு 4 வினாடிக்கும் புதுப்பிக்கப்படும்",
    "4秒ごとに自動更新",
    "每4秒自动刷新",
  ],
  [
    "vs previous period",
    "முந்தைய காலத்துடன் ஒப்பிடுகையில்",
    "前期間比",
    "与上一周期相比",
  ],
  [
    "Confirmed order value · JPY",
    "உறுதிசெய்த ஆர்டர் மதிப்பு · JPY",
    "確定注文の金額・JPY",
    "已确认订单金额 · 日元",
  ],
  ["Daily figures", "தினசரி விவரங்கள்", "日別データ", "每日数据"],
  ["Date", "தேதி", "日付", "日期"],
  ["Restock", "இருப்பை நிரப்புக", "補充", "补货"],
  ["Review", "மதிப்பாய்வு", "確認", "查看"],
  ["STAFF WORKSPACE", "ஊழியர் பணியிடம்", "スタッフ管理画面", "员工工作台"],
  ["Staff workspace", "ஊழியர் பணியிடம்", "スタッフ管理画面", "员工工作台"],
  [
    "Open customer shop",
    "வாடிக்கையாளர் கடையைத் திற",
    "ショップを開く",
    "打开客户商店",
  ],
  ["Everything in sync", "அனைத்தும் ஒத்திசைவில்", "すべて同期中", "全部同步中"],
  [
    "Good finds for everyday living.",
    "அன்றாட வாழ்விற்கான சிறந்த தேர்வுகள்.",
    "毎日の暮らしに、いいものを。",
    "为日常生活发现好物。",
  ],
  ["All products", "அனைத்துப் பொருட்கள்", "すべての商品", "全部商品"],
  [
    "Tech & audio",
    "தொழில்நுட்பம் மற்றும் ஒலி",
    "テクノロジー・オーディオ",
    "数码与音频",
  ],
  ["Home & living", "வீடு மற்றும் வாழ்க்கை", "ホーム・生活用品", "家居生活"],
  ["Everyday carry", "அன்றாடப் பைகள்", "バッグ・携帯用品", "日常随身用品"],
  ["Wellness", "உடல்நலம்", "ウェルネス", "健康生活"],
  ["Cart", "கூடை", "カート", "购物车"],
  ["Your cart", "உங்கள் கூடை", "カートの中身", "您的购物车"],
  ["Your orders", "உங்கள் ஆர்டர்கள்", "ご注文履歴", "您的订单"],
  ["Orders", "ஆர்டர்கள்", "注文", "订单"],
  ["Sign in", "உள்நுழைக", "ログイン", "登录"],
  ["Sign out", "வெளியேறு", "ログアウト", "退出"],
  ["Add to cart", "கூடையில் சேர்", "カートに追加", "加入购物车"],
  [
    "Added to cart",
    "கூடையில் சேர்க்கப்பட்டது",
    "カートに追加しました",
    "已加入购物车",
  ],
  ["Out of stock", "இருப்பில் இல்லை", "在庫切れ", "缺货"],
  ["In stock", "இருப்பில் உள்ளது", "在庫あり", "有货"],
  [
    "Only in-stock products",
    "இருப்பில் உள்ள பொருட்கள் மட்டும்",
    "在庫のある商品のみ",
    "仅显示有货商品",
  ],
  ["Search products", "பொருட்களைத் தேடுங்கள்", "商品を検索", "搜索商品"],
  [
    "Search products, categories…",
    "பொருட்கள், வகைகளைத் தேடுங்கள்…",
    "商品・カテゴリーを検索…",
    "搜索商品、分类…",
  ],
  [
    "Search the collection",
    "பொருட்களைத் தேடுங்கள்",
    "コレクションを検索",
    "搜索商品系列",
  ],
  ["Featured", "சிறப்புப் பொருட்கள்", "おすすめ", "精选"],
  ["Featured picks", "சிறப்புத் தேர்வுகள்", "おすすめ商品", "精选推荐"],
  [
    "Price: low to high",
    "விலை: குறைவிலிருந்து அதிகம்",
    "価格の安い順",
    "价格从低到高",
  ],
  [
    "Price: high to low",
    "விலை: அதிகத்திலிருந்து குறைவு",
    "価格の高い順",
    "价格从高到低",
  ],
  ["Name: A–Z", "பெயர்: A–Z", "商品名順", "名称排序"],
  ["Sort by", "வரிசைப்படுத்து", "並び替え", "排序"],
  ["Continue shopping", "தொடர்ந்து வாங்குங்கள்", "買い物を続ける", "继续购物"],
  ["Back to shop", "கடைக்குத் திரும்பு", "ショップに戻る", "返回商店"],
  ["Checkout", "வாங்குவதை முடிக்கவும்", "ご購入手続き", "结账"],
  ["Proceed to checkout", "பணம் செலுத்தச் செல்லவும்", "購入手続きへ", "前往结账"],
  ["Order summary", "ஆர்டர் சுருக்கம்", "ご注文内容", "订单摘要"],
  ["Subtotal", "கூட்டுத்தொகை", "小計", "小计"],
  ["Total", "மொத்தம்", "合計", "总计"],
  ["Delivery", "விநியோகம்", "配送", "配送"],
  ["Free", "இலவசம்", "無料", "免费"],
  ["FREE", "இலவசம்", "無料", "免费"],
  ["Shipping", "அனுப்புதல்", "送料", "运费"],
  ["Quantity", "எண்ணிக்கை", "数量", "数量"],
  ["Remove", "நீக்கு", "削除", "移除"],
  ["Each", "ஒன்றுக்கு", "単価", "单价"],
  ["Delivery details", "விநியோக விவரங்கள்", "お届け先情報", "配送信息"],
  ["Full name", "முழுப் பெயர்", "氏名", "姓名"],
  ["Address", "முகவரி", "住所", "地址"],
  ["Street address", "தெரு முகவரி", "番地・建物名", "街道地址"],
  ["City", "நகரம்", "市区町村", "城市"],
  ["Postal code", "அஞ்சல் குறியீடு", "郵便番号", "邮政编码"],
  ["Place order", "ஆர்டர் செய்க", "注文を確定", "提交订单"],
  ["Confirm order", "ஆர்டரை உறுதிசெய்", "注文を確認", "确认订单"],
  ["Cash on Delivery", "பெற்றுக்கொண்டு பணம் செலுத்துங்கள்", "代金引換", "货到付款"],
  [
    "Pay the saved amount when your order arrives.",
    "ஆர்டர் வந்ததும் குறிப்பிட்ட தொகையைச் செலுத்துங்கள்.",
    "商品到着時に表示金額をお支払いください。",
    "订单送达时支付已确认的金额。",
  ],
  [
    "How would you like to pay?",
    "எப்படி பணம் செலுத்த விரும்புகிறீர்கள்?",
    "お支払い方法を選択",
    "请选择付款方式",
  ],
  ["Payment currency", "பணம் செலுத்தும் நாணயம்", "お支払い通貨", "支付币种"],
  [
    "Due on delivery",
    "விநியோகத்தின்போது செலுத்தவேண்டும்",
    "配達時にお支払い",
    "送达时付款",
  ],
  [
    "Amount at test checkout",
    "சோதனைக் கட்டணத் தொகை",
    "テスト決済金額",
    "测试结账金额",
  ],
  ["Demo card payment", "மாதிரி அட்டை கட்டணம்", "デモカード決済", "演示银行卡付款"],
  ["Demo QR payment", "மாதிரி QR கட்டணம்", "デモQR決済", "演示二维码付款"],
  [
    "Fake card supplied · no money charged · no keys needed",
    "மாதிரி அட்டை உள்ளது · பணம் பிடிக்கப்படாது · சாவிகள் தேவையில்லை",
    "架空カード付き・請求なし・キー不要",
    "提供虚拟卡 · 不会扣款 · 无需密钥",
  ],
  [
    "Simulated QR checkout · no money charged",
    "மாதிரி QR கட்டணம் · பணம் பிடிக்கப்படாது",
    "QR決済シミュレーション・請求なし",
    "模拟二维码结账 · 不会扣款",
  ],
  [
    "Demo payments use fictional details. No bank, card or wallet is charged.",
    "மாதிரிக் கட்டணங்கள் கற்பனை விவரங்களைப் பயன்படுத்துகின்றன. வங்கி, அட்டை அல்லது பணப்பையிலிருந்து பணம் பிடிக்கப்படாது.",
    "デモ決済には架空の情報を使用します。銀行・カード・ウォレットへの請求はありません。",
    "演示付款使用虚拟信息，不会从银行、银行卡或钱包扣款。",
  ],
  [
    "Complete demo payment",
    "மாதிரிக் கட்டணத்தை முடி",
    "デモ決済を完了",
    "完成演示付款",
  ],
  ["Cancel", "ரத்து செய்", "キャンセル", "取消"],
  ["Close", "மூடு", "閉じる", "关闭"],
  [
    "Download PDF receipt",
    "PDF ரசீதைப் பதிவிறக்கு",
    "PDF領収書をダウンロード",
    "下载PDF收据",
  ],
  ["Download receipt", "ரசீதைப் பதிவிறக்கு", "領収書をダウンロード", "下载收据"],
  ["View orders", "ஆர்டர்களைப் பார்", "注文を見る", "查看订单"],
  ["Check payment", "கட்டணத்தைச் சரிபார்", "決済状況を確認", "查询付款状态"],
  ["Resume payment", "கட்டணத்தைத் தொடர்க", "決済を再開", "继续付款"],
  ["Cancel order", "ஆர்டரை ரத்து செய்", "注文をキャンセル", "取消订单"],
  ["confirmed", "உறுதிசெய்யப்பட்டது", "確定", "已确认"],
  ["pending", "நிலுவையில்", "保留中", "待处理"],
  ["cancelled", "ரத்து செய்யப்பட்டது", "キャンセル済み", "已取消"],
  ["paid", "செலுத்தப்பட்டது", "支払い済み", "已付款"],
  ["due", "செலுத்தவேண்டும்", "未払い", "待付款"],
  ["refunded", "திருப்பியளிக்கப்பட்டது", "返金済み", "已退款"],
  ["Good finds.", "நல்ல தேர்வுகள்.", "素敵な出会い。", "发现好物。"],
  [
    "Better everyday.",
    "சிறந்த அன்றாடம்.",
    "毎日をもっと豊かに。",
    "让每天更美好。",
  ],
  [
    "THE EVERYDAY, UPGRADED",
    "மேம்பட்ட அன்றாடம்",
    "毎日をアップグレード",
    "升级日常生活",
  ],
  [
    "Thoughtful essentials for your home, your work, and everything in between.",
    "உங்கள் வீடு, வேலை மற்றும் அன்றாடத்திற்கான சிறந்த பொருட்கள்.",
    "暮らしにも仕事にも。毎日に寄り添うアイテム。",
    "为居家、工作和日常精心挑选的必需品。",
  ],
  ["Explore the collection", "தொகுப்பைப் பாருங்கள்", "商品を見る", "探索商品系列"],
  [
    "Real stock. Simple checkout. Less guesswork.",
    "உண்மையான இருப்பு. எளிய கொள்முதல்.",
    "在庫が見える。購入はシンプル。",
    "库存透明，结账便捷。",
  ],
  [
    "Make room for good things",
    "நல்லவற்றிற்கு இடம் கொடுங்கள்",
    "いいものを暮らしに",
    "为好物留出空间",
  ],
  [
    "Explore our everyday essentials",
    "அன்றாடப் பொருட்களைப் பாருங்கள்",
    "毎日の必需品を探す",
    "探索日常好物",
  ],
  ["Delivery, on us", "இலவச விநியோகம்", "送料無料", "免费配送"],
  [
    "Free delivery on every order",
    "அனைத்து ஆர்டர்களுக்கும் இலவச விநியோகம்",
    "すべてのご注文が送料無料",
    "所有订单免运费",
  ],
  ["Shop with clarity", "தெளிவாக வாங்குங்கள்", "安心してお買い物", "放心选购"],
  [
    "See available stock before you buy",
    "வாங்குமுன் இருப்பைப் பாருங்கள்",
    "購入前に在庫を確認",
    "购买前查看库存",
  ],
  ["Keep your receipt", "ரசீதைப் பாதுகாக்கவும்", "領収書を保存", "保留收据"],
  [
    "Download a PDF after confirmation",
    "உறுதிப்படுத்தியபின் PDF பதிவிறக்கவும்",
    "注文確定後にPDFをダウンロード",
    "确认后下载PDF",
  ],
  [
    "A LITTLE SOMETHING FOR EVERY DAY",
    "ஒவ்வொரு நாளுக்கும் சிறப்பு",
    "毎日に、小さないいものを",
    "每天都有小确幸",
  ],
  ["YOUR SEARCH", "உங்கள் தேடல்", "検索結果", "搜索结果"],
  [
    "Launch offers · 50% off selected new arrivals · While stocks last · Free delivery",
    "அறிமுகச் சலுகைகள் · தேர்ந்தெடுத்த புதிய பொருட்களுக்கு 50% தள்ளுபடி · இருப்புள்ளவரை · இலவச விநியோகம்",
    "オープン記念・対象の新商品が50%OFF・在庫限り・送料無料",
    "开店优惠 · 部分新品五折 · 售完为止 · 免费配送",
  ],
  ["Overview", "கண்ணோட்டம்", "概要", "概览"],
  ["Inventory", "சரக்கு இருப்பு", "在庫管理", "库存管理"],
  ["Stock activity", "இருப்பு நடவடிக்கைகள்", "在庫履歴", "库存动态"],
  ["Products", "பொருட்கள்", "商品", "商品"],
  ["Current stock", "தற்போதைய இருப்பு", "現在の在庫", "当前库存"],
  ["Low stock", "குறைந்த இருப்பு", "在庫僅少", "库存不足"],
  ["Add product", "பொருளைச் சேர்", "商品を追加", "添加商品"],
  ["Save changes", "மாற்றங்களைச் சேமி", "変更を保存", "保存更改"],
  ["Edit", "திருத்து", "編集", "编辑"],
  ["Delete", "நீக்கு", "削除", "删除"],
  ["Refresh", "புதுப்பி", "更新", "刷新"],
  ["Stock incoming", "வரும் இருப்பு", "入庫", "入库"],
  ["Stock outgoing", "சென்ற இருப்பு", "出庫", "出库"],
  [
    "Inventory dashboard",
    "சரக்கு இருப்புக் காட்சிப்பலகை",
    "在庫ダッシュボード",
    "库存仪表盘",
  ],
  [
    "Sales & inventory intelligence",
    "விற்பனை மற்றும் இருப்பு ஆய்வு",
    "売上・在庫分析",
    "销售与库存分析",
  ],
  [
    "Download stats PDF",
    "புள்ளிவிவர PDF பதிவிறக்கு",
    "統計PDFをダウンロード",
    "下载统计PDF",
  ],
  ["Sales revenue", "விற்பனை வருவாய்", "売上高", "销售收入"],
  ["Orders placed", "ஆர்டர்கள்", "注文件数", "订单数"],
  ["Units sold", "விற்ற எண்ணிக்கை", "販売数量", "已售数量"],
  ["Revenue trend", "வருவாய்ப் போக்கு", "売上推移", "收入趋势"],
  ["Best sellers", "சிறந்த விற்பனைகள்", "売れ筋商品", "畅销商品"],
  ["Slow movers", "மெதுவாக விற்கும் பொருட்கள்", "動きの遅い商品", "滞销商品"],
  [
    "Low-stock alerts",
    "குறைந்த இருப்பு எச்சரிக்கைகள்",
    "在庫不足アラート",
    "低库存提醒",
  ],
  ["Sales mix", "விற்பனைக் கலவை", "売上の内訳", "销售构成"],
  ["Demo sales", "மாதிரி விற்பனை", "デモ売上", "演示销售"],
  ["Other sales", "பிற விற்பனை", "その他の売上", "其他销售"],
  ["No sales yet", "இன்னும் விற்பனை இல்லை", "売上はまだありません", "暂无销售"],
  ["7 days", "7 நாட்கள்", "7日間", "7天"],
  ["30 days", "30 நாட்கள்", "30日間", "30天"],
  ["All clear", "பிரச்சினை இல்லை", "問題なし", "一切正常"],
  [
    "Same as previous period",
    "முந்தைய காலத்திற்குச் சமம்",
    "前期間と同じ",
    "与上一周期持平",
  ],
  [
    "No previous sales to compare",
    "ஒப்பிட முந்தைய விற்பனை இல்லை",
    "比較対象の売上がありません",
    "无上一周期销售可比较",
  ],
  ["Account", "கணக்கு", "アカウント", "账户"],
  ["Email", "மின்னஞ்சல்", "メールアドレス", "电子邮箱"],
  ["Password", "கடவுச்சொல்", "パスワード", "密码"],
  ["Email address", "மின்னஞ்சல் முகவரி", "メールアドレス", "邮箱地址"],
  ["Welcome back", "மீண்டும் வருக", "おかえりなさい", "欢迎回来"],
  ["Live stock", "நேரடி இருப்பு", "最新の在庫", "实时库存"],
  ["Loading…", "ஏற்றுகிறது…", "読み込み中…", "正在加载…"],
  ["Previous", "முந்தைய", "前へ", "上一页"],
  ["Next", "அடுத்தது", "次へ", "下一页"],
];
const dictionaries = new Map(
  [...rows, ...extraLabels, ...completeLabels]
    .filter(([key]) => !key.includes("{0}"))
    .map(([key, ...values]) => [key, values]),
);

export const locale = () =>
  ({ en: "en-GB", ta: "ta-IN", ja: "ja-JP", zh: "zh-CN" })[language.value];
const insensitive = new Map(
  [...dictionaries].map(([key, values]) => [key.toLowerCase(), values]),
);
const escapePattern = (value: string) =>
  [...value]
    .map((char) => ("\\^$.*+?()[]{}|".includes(char) ? "\\" + char : char))
    .join("");
const patterns = completeLabels
  .filter(([key]) => key.includes("{0}"))
  .sort(
    (a, b) =>
      b[0].replace(/\{\d+\}/g, "").length - a[0].replace(/\{\d+\}/g, "").length,
  )
  .map(([key, ...values]) => {
    const tokens = [...key.matchAll(/\{(\d+)\}/g)];
    let source = "^",
      previous = 0;
    for (const token of tokens) {
      source += escapePattern(key.slice(previous, token.index)) + "(.+?)";
      previous = token.index + token[0].length;
    }
    source += escapePattern(key.slice(previous)) + "$";
    return {
      regex: new RegExp(source, "i"),
      values,
      slots: tokens.map((token) => Number(token[1])),
    };
  });
function translate(value: string, depth = 0): string {
  if (language.value === "en" || depth > 5) return value;
  const index = { ta: 0, ja: 1, zh: 2 }[language.value];
  const text = value.trim();
  const direct = dictionaries.get(text) ?? insensitive.get(text.toLowerCase());
  let translated: string | undefined = direct?.[index];
  if (translated === undefined)
    for (const pattern of patterns) {
      const match = pattern.regex.exec(text);
      if (!match) continue;
      const slots = new Map(
        pattern.slots.map((slot, i) => [slot, match[i + 1]]),
      );
      translated = pattern.values[index].replace(
        /\{(\d+)\}/g,
        (_, slot: string) =>
          translate(slots.get(Number(slot)) ?? "", depth + 1),
      );
      break;
    }
  // Translate compound UI labels while keeping codes, names, amounts and dates intact.
  if (translated === undefined && / · | \/ /.test(text))
    translated = text
      .split(/( · | \/ )/)
      .map((part) => translate(part, depth + 1))
      .join("");
  if (translated === undefined) return value;
  return (
    value.slice(0, value.indexOf(text)) +
    translated +
    value.slice(value.indexOf(text) + text.length)
  );
}
export function t(value: string): string {
  return translate(value);
}

function translateChildren(value: any): any {
  return typeof value === "string"
    ? t(value)
    : Array.isArray(value)
      ? value.map(translateChildren)
      : value;
}
export const h: typeof vueH = ((...args: any[]) => {
  // Reading the locale in every render makes even an English-only view react to changes.
  language.value;
  if (
    args.length === 2 &&
    (typeof args[1] === "string" || Array.isArray(args[1]))
  )
    args[1] = translateChildren(args[1]);
  else if (args.length >= 3) args[2] = translateChildren(args[2]);
  if (
    args[1] &&
    typeof args[1] === "object" &&
    !Array.isArray(args[1]) &&
    !args[1].__v_isVNode
  ) {
    args[1] = { ...args[1] };
    for (const key of ["placeholder", "title", "aria-label"])
      if (typeof args[1][key] === "string") args[1][key] = t(args[1][key]);
  }
  return (vueH as any)(...args);
}) as typeof vueH;
export function languageSelect() {
  return vueH("label", { class: "language-picker" }, [
    vueH("span", { "aria-hidden": "true" }, "◎   "),
    vueH(
      "select",
      {
        "aria-label": "Language / மொழி / 言語 / 语言",
        value: language.value,
        onChange: (e: Event) => {
          language.value = (e.target as HTMLSelectElement).value as Language;
        },
      },
      [
        ["en", "English"],
        ["ta", "தமிழ்"],
        ["ja", "日本語"],
        ["zh", "中文"],
      ].map(([value, label]) => vueH("option", { value }, label)),
    ),
  ]);
}

if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (
      event.key === "solaistore.language" &&
      ["en", "ta", "ja", "zh"].includes(event.newValue ?? "")
    )
      language.value = event.newValue as Language;
  });

// Consume cross-port locale once; a later refresh must keep the user's newest choice.
if (typeof window !== "undefined" && incoming !== null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("lang");
  window.history.replaceState(null, "", url.href);
}
