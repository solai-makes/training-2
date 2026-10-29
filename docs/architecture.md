# 初期アーキテクチャ方針

## システム境界

```text
public-frontend  -> public-api  -> PostgreSQL
private-frontend -> private-api -> PostgreSQL
                         ^
                    Cognito互換認証
```

- `public-*`は購入者向け、`private-*`は管理者向けとする。
- APIはHono、型と入力検証はTypeScript/Zodを使う。
- PostgreSQLのSQL migrationをデータベース定義の正とし、Prismaは型生成・DBアクセスに使う。
- API契約は`packages/api-contracts`を正とし、OpenAPIとClientを生成する。
- 画面仕様は`packages/screen-contracts`を正とする。

## 主なデータモデル

- `products`: 商品コード、商品名、説明、価格（JPY整数）、在庫数、作成日時、更新日時。
- `orders`: 注文ID、所有者subject、状態、合計金額、作成日時、更新日時。
- `order_items`: 注文ID、商品ID、保存単価、数量、小計。
- `order_idempotency_keys`: 所有者subject、冪等キー、入力ハッシュ、注文ID。subjectとキーの組を一意にする。

価格と数量は整数で保持し、APIでは金額単位を明示する。DBモデルをそのまま外部DTOとして公開しない。

## トランザクションとロック

注文確定・キャンセルはサービス層でトランザクションを開始する。複数商品の確定では商品ID昇順に在庫行を`SELECT FOR UPDATE`し、在庫確認と更新を同一トランザクションで行う。注文状態の更新も同じトランザクションに含める。

在庫不足、状態不一致、制約違反はロールバックする。デッドロック等の一時的失敗はAPIで成功扱いにせず、識別可能なサーバーエラーとして記録する。再試行はStep11で実装方針を確定する。

## API境界

- 契約スキーマでリクエストを検証する。
- 業務ルール（在庫、状態、所有者、冪等性）はサービス層で検証する。
- 送信前レスポンスを契約スキーマで実行時検証し、失敗時は秘匿したログと`INTERNAL_ERROR`で処理する。
- ログにはrequestId、操作種別、結果、対象IDを記録し、トークンや秘密情報は記録しない。

