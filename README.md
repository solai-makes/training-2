# training2

## Quick start

Open this folder in the VS Code Dev Container, then run:

```bash
pnpm dev
```

This applies SQL migrations, prepares local Cognito accounts, generates Prisma
from PostgreSQL, and starts all four app servers. It does not reset existing products.

- Admin: http://localhost:5174/
- Local admin email: `admin@example.test`
- Local admin password: `Training2-local!`
- Shop scaffold: http://localhost:5173/

The Admin page supports registering and listing products, including duplicate-code
and input validation. Product data persists in PostgreSQL. Shop search and ordering
are not implemented yet. These credentials are only for the local Cognito emulator.

Run `pnpm setup:local` before `pnpm typecheck`, `pnpm test`, or `pnpm build`
on a fresh container. Stop development servers with Ctrl+C.

See [development environment](docs/development-environment.md) for details.

## Overview

`training2` は REST API の設計・実装・運用を体系的に学習するためのトレーニングプロジェクトです。
このプロジェクトの実装計画は `docs/implementation-plan.md` です。

本プロジェクトでは以下を学習対象とします。

* REST API設計
* OpenAPI駆動開発
* Contract First Development
* PostgreSQL中心設計
* TypeScriptフルスタック開発
* モノレポ運用
* Dockerによる開発環境構築
* CI/CD自動化
* Screen Contractによる仕様管理
* AI Agentを活用した開発フロー

GraphQL は本プロジェクトでは採用しません。

GraphQL の学習および導入は次プロジェクトである **training3** にて行います。

---

# Training Application

## Mini EC Site

REST API 学習用の題材として、小規模な EC サイトを構築します。

本システムは以下の要件を満たすことを目標とします。

### 商品

#### 商品登録

対象:

```txt
private-frontend
private-api
```

商品を登録できること。

管理項目:

* 商品コード
* 商品名
* 商品説明
* 商品価格
* 在庫数

#### 商品一覧

対象:

```txt
private-frontend
private-api
```

登録済み商品を一覧表示できること。

---

### 注文

#### 商品検索

対象:

```txt
public-frontend
public-api
```

検索条件:

* 商品コード
* 商品名

#### 注文作成

対象:

```txt
public-frontend
public-api
```

商品を選択して注文を作成できること。

#### 注文確定

対象:

```txt
public-frontend
public-api
```

注文内容を確定できること。

注文確定時には在庫を引き当てる。

#### 注文キャンセル

対象:

```txt
public-frontend
public-api
```

注文をキャンセルできること。

キャンセル時には在庫を戻す。

---

### 在庫

#### 在庫状況表示

対象:

```txt
public-frontend
public-api
```

現在の在庫数を表示すること。

#### 在庫不足チェック

対象:

```txt
public-frontend
public-api
```

注文確定時に在庫不足の場合は失敗させること。

---

### 排他制御

本プロジェクトでは PostgreSQL の排他制御を学習対象とします。

以下のケースで在庫数が負数にならないこと。

```txt
在庫: 1

ユーザーA 注文確定
ユーザーB 注文確定

結果:
A 成功
B 失敗
```

学習対象:

* Transaction
* Row Lock
* SELECT FOR UPDATE
* 悲観ロック
* 楽観ロック

---

# Development Environment

本プロジェクトは **Dev Container** を前提とします。

開発環境はコンテナ内に閉じ込めることで、

* 開発者間の環境差異を排除
* CI環境との整合性確保
* Agent開発環境の統一

を目的としています。

また Dev Container 環境内では、

* Codex CLI

に対して比較的強い権限を付与する運用を想定しています。

ホストOSへの影響を最小化しながら、AI Agentによるコード生成・リファクタリング・テスト実行を積極的に活用します。

---

# Technology Stack

## Frontend

* Vue
* Element Plus
* TypeScript
* Zod
* Axios
* TanStack Query
* AWS Amplify
* Vite 8系

## Backend

* Hono
* TypeScript
* Zod
* Prisma
* aws-jwt-verify

## Database

* PostgreSQL

## Schemas

* PostgreSQL Schema
* Prisma Schema
* hono/zod-openapi

## Test

### Frontend

* Vitest
* Playwright

### Backend

* Chai
* Node Test Runner

## CI/CD

* GitHub Actions

## Runtime

* Docker Container

## Node

* Node: 26.10.0
* pnpm: 12.9.1

---

# Architecture Principles

本プロジェクトは Single Source of Truth (SSOT) を採用します。

---

## Database Contract

PostgreSQL をデータベース定義の正とします。

```txt
PostgreSQL
↓
Prisma
↓
Application
```

Prisma は DB 定義の正ではありません。

Prisma Client生成のために利用します。

---

## API Contract

REST API は Contract First Development を採用します。

```txt
API Contract
↓
OpenAPI
↓
Routes
↓
Clients
```

OpenAPI仕様を中心に、

* Validation
* Documentation
* Route
* API Client

の整合性を維持します。

---

## Screen Contract

画面仕様は Screen Contract を中心に管理します。

Screen Contract から以下を生成または検証します。

* Documentation
* Route Validation
* E2E Test Validation
* CI Consistency Check

```txt
Screen Contract
↓
Docs
↓
Routes
↓
E2E Tests
```

---

# Generation Flows

## Database Generation Flow

PostgreSQL を正とした型生成フローです。

```txt
packages/postgres/migrations
↓
prisma db pull
↓
prisma generate
↓
packages/prisma/generated
↓
apps/*-api / packages/*
```

### Rules

* PostgreSQL Schema を正とする
* Prisma Schema は編集しない
* Prisma Client は自動生成物として扱う

---

## REST API Generation Flow

REST API契約を正とした生成フローです。

```txt
packages/api-contracts
↓
hono/zod-openapi
↓
schemas/openapi
↓
apps/public-api / apps/private-api
↓
packages/api-client
```

### Generated Artifacts

OpenAPI Document を生成します。Route Definition と Request/Response Validation は `packages/api-contracts` に定義し、OpenAPI へ反映します。

* OpenAPI Document（`schemas/openapi`）
* Route Definition / Request Validation / Response Validation（`packages/api-contracts`）
* REST Client

---

# Repository Structure

```txt
new-project
├─ apps
│  ├─ public-frontend
│  ├─ private-frontend
│  ├─ public-api
│  └─ private-api
│
├─ packages
│  ├─ postgres
│  │  ├─ migrations
│  │  ├─ schemas
│  │  ├─ tables
│  │  ├─ views
│  │  ├─ functions
│  │  ├─ policies
│  │  ├─ seeds
│  │  └─ scripts
│  │
│  ├─ prisma
│  │  ├─ schema.prisma
│  │  ├─ generated
│  │  └─ scripts
│  │
│  ├─ api-contracts
│  │  ├─ routes
│  │  └─ schemas
│  │
│  ├─ api-client
│  ├─ screen-contracts
│  ├─ auth
│  ├─ ui
│  └─ test-utils
│
├─ schemas
│  ├─ openapi
│  └─ generated
│
├─ infra
│  ├─ docker
│  │  ├─ Dockerfile
│  │  ├─ docker-compose.yml
│  │  └─ postgres
│  └─ terraform
│
├─ docs
│  └─ *.md
│
├─ tools
│  ├─ codegen
│  └─ scripts
│
├─ .github
│  └─ workflows
│
├─ .husky
│  └─ pre-commit
│
├─ .devcontainer
│  ├─ devcontainer.json
│  └─ docker-compose.yml
│
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ biome.json
├─ AGENTS.md
├─ ISSUES.md
└─ README.md
```

---

# Project Goals

training2 の目標は以下です。

* REST APIの理解
* OpenAPI駆動開発の理解
* Contract First Developmentの理解
* PostgreSQL中心設計の理解
* Transactionと排他制御の理解
* Screen Contractによる仕様管理の実践
* AI Agentを活用した開発フローの確立

GraphQLは扱いません。

GraphQL は training3 にて学習・導入します。
