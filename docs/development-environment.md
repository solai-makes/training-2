# 開発環境

## アプリの起動

Dev Container内のターミナルで `pnpm dev` を実行する。
購入者向け画面は http://localhost:5173/ 、管理者向け画面は http://localhost:5174/ 。
4つの開発サーバーをまとめて起動し、Ctrl+Cで停止する。
管理者画面では商品登録・一覧表示が可能。購入者画面は起動確認用であり、商品検索・注文機能は未実装。
画面のAPI接続確認は `/api/health` を各APIの `/health` へプロキシする。
Viteの `.env` 自動読み込みは `envDir: false` で無効化している。

### 初回準備と認証

`pnpm dev` は最初に `pnpm setup:local` を実行する。
SQL migrationを適用し、Cognito Localのプール・クライアント・開発用アカウントを準備した後、
PostgreSQLからPrisma SchemaとClientを生成する。既存商品を初期化しない。

- 管理者: `admin@example.test` / `Training2-local!`
- 購入者（権限拒否のテスト用）: `buyer@example.test` / `Training2-local!`

APIは署名・issuer・有効期限・クライアント・token_useを検証したアクセストークンを要求する。
商品APIはadminグループのみ利用できる。ログアウト時にブラウザのセッション用トークンを削除する。
これらはローカルエミュレーター専用のアカウントであり、本番認証設定ではない。

CognitoのTokenConfigを変更した場合はCognitoコンテナを再起動して設定を反映する。
接続情報のうちプールID・クライアントIDのみを `.local/cognito.json` に保存する。
このディレクトリとPrisma Client生成物はGit管理しない。
Prisma SchemaはSQL migration適用後に `db pull` で生成し、手編集しない。

### 商品API

- `POST /products`: 商品コード・名称・説明・JPY価格・初期在庫を登録。
- `GET /products?page=1&pageSize=20`: コード順の商品一覧と総件数。
- `GET /openapi.json`: 契約から生成したOpenAPI。

未認証401、購入者403、入力不正400、コード重複409。
正常レスポンスは送信前に契約スキーマで検証する。
価格・在庫・空の必須項目はPostgreSQLの制約でも拒否する。

### 検証

```bash
pnpm setup:local
pnpm typecheck
pnpm test
pnpm build
```

商品APIの結合テストは実PostgreSQLとCognito Localを使用する。
テストで作成した商品だけを終了時に削除し、既存商品を削除しない。
Windowsの共有フォルダでも編集を検出できるよう、ViteとAPIの開発用監視はポーリングを使用する。

## 起動

1. Docker Desktopを起動する。
2. VS Codeでリポジトリを開き、Dev Containersの「Reopen in Container」を実行する。
3. コンテナ作成時に`.devcontainer/post-create.sh`がpnpm依存関係をインストールする。

ホストへNode.js、pnpm、PostgreSQLをインストールする必要はない。依存関係の取得・生成・テストはコンテナ内で実行する。

## サービスとポート

| サービス | コンテナ内接続先 | ホスト公開ポート |
| --- | --- | ---: |
| PostgreSQL | `db:5432` | 5432 |
| Cognito Local | `cognito-local:9229` | 9229 |
| public-api | `app:3000` | 3000 |
| private-api | `app:3001` | 3001 |
| public-frontend | `app:5173` | 5173 |
| private-frontend | `app:5174` | 5174 |

アプリからDBへ接続するURLは`postgresql://postgres:postgres@db:5432/training2?schema=public`とする。ブラウザからAPIへ接続する場合は`http://localhost:3000`または`http://localhost:3001`を使う。

## 環境変数

開発用の接続値は`.devcontainer/docker-compose.yml`へ明示している。`.env`は使用しない。秘密情報を追加する場合は、後続のCI・配備でSecret管理方式を決めてから追加する。

## 確認コマンド

Dev Container内で次を実行する。

```bash
node --version       # v26.10.0
pnpm --version       # 12.9.1
pg_isready -h db -U postgres -d training2
curl -fsS http://cognito-local:9229/
pnpm typecheck
pnpm test
pnpm build
```

最初の商品機能ではCognito Localのアクセストークンをjoseで検証する。
ローカルのissuerとコンテナ内JWKS接続先を分離し、署名と各クレームを検証する。
正式な本番Cognito・Amplify接続とaws-jwt-verifyの採用確認は後続の認証Stepで扱う。
