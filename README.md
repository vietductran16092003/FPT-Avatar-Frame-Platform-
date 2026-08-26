# FPT Avatar Frame Platform

Ứng dụng web cho phép nhân viên FPT tạo avatar cá nhân từ các khung ảnh (frame) theo chiến dịch (campaign) — ví dụ khung kỷ niệm sinh nhật FPT — và tải ảnh kết quả về. Admin quản lý chiến dịch/khung ảnh qua trang quản trị riêng.

Xây dựng bằng **Next.js 14 (App Router)**, **Prisma + PostgreSQL**, ảnh lưu trên **MinIO** (tương thích S3), ghép ảnh bằng **node-canvas** (server) và **Fabric.js** (xem trước trên trình duyệt).

## Actor

| Actor | Vào từ | Làm gì |
|---|---|---|
| **Public / User** | trang chủ `/` | Xem danh sách chiến dịch đang mở, chọn khung, upload ảnh, điền thông tin (năm gia nhập, đơn vị...), xem trước và tải avatar. Đăng nhập (tuỳ chọn) để xem lại lịch sử tải ảnh ở `/tai-khoan`. |
| **Admin** | `/admin/login` | Tạo/sửa/xoá chiến dịch và khung ảnh, cấu hình các trường overlay chữ (vị trí, cỡ, màu, đường cong, viền, bóng đổ), đổi trạng thái chiến dịch (draft/active/archived), xem thống kê lượt tải (`/admin/analytics`), xem thông báo hệ thống. |

Phân quyền theo `role` (`user` / `admin`) lưu trên bản ghi `User`, gán khi đăng nhập lần đầu (xem phần Xác thực bên dưới).

## Tính năng chính

- **Ghép ảnh khung + ảnh cá nhân**: kéo/thu phóng ảnh cá nhân trong vùng khung (pan/zoom qua Fabric.js), server render lại ở độ phân giải gốc khi tải về — bản xem trước và ảnh tải về luôn khớp nhau.
- **Trường overlay chữ tuỳ biến** trên mỗi khung: chữ tự do, danh sách chọn (dropdown), hoặc kiểu `yearsSince` (tự tính "N NĂM LÀM FPT" từ năm gia nhập, floor ở 1 năm).
- **Chữ theo đường cong (curved text)**: overlay có thể uốn theo cung tròn quanh khung ảnh (ví dụ dải ruy-băng "N NĂM LÀM FPT"), kèm tuỳ chọn độ đậm (`fontWeight`), viền chữ (`stroke`) và bóng đổ (`shadow`). Logic layout dùng chung một hàm thuần (`resolveOverlayDraws`) cho cả bản xem trước (client) và ảnh tải về (server) nên luôn khớp nhau.
- **Trang quản trị khung ảnh**: kéo-thả để đặt vùng ảnh cá nhân và đường cong chữ trực tiếp trên ảnh khung; các trường overlay phổ biến (năm gia nhập, đơn vị công tác, câu châm ngôn...) có sẵn preset đã style, tích vào là dùng được ngay.
- **Google Analytics 4**: theo dõi lượt xem chiến dịch, chọn khung, tải avatar; dashboard admin đọc số liệu tổng hợp từ GA4 (tuỳ chọn, xem hướng dẫn bên dưới).
- **Đăng nhập FPT (Azure AD)** cho cả người dùng thường và admin, có chế độ giả lập (dev-login) để phát triển/test cục bộ mà không cần Azure AD thật.

## Bắt đầu nhanh (local dev)

### 1. Yêu cầu
- Node.js 20+, Docker (chạy Postgres + MinIO)

### 2. Khởi động hạ tầng (Postgres + MinIO)
```bash
docker compose -f docker-compose.dev.yml up -d
```
Postgres ở `localhost:5432` (db `avatar_platform`), MinIO ở `localhost:9000` (console `:9001`, tài khoản `minioadmin`/`minioadmin`).

### 3. Cấu hình biến môi trường
```bash
cp .env.example .env
```
Xem chi tiết từng biến trong `.env.example`. Mặc định `.env.example` đã trỏ đúng vào Postgres/MinIO local ở bước 2 — chỉ cần chỉnh khi muốn bật đăng nhập giả lập, Azure AD thật, hoặc GA4 (xem mục **Xác thực** và **Google Analytics** bên dưới).

### 4. Cài đặt & khởi tạo database
```bash
npm install
npx prisma migrate deploy
npx prisma db seed
```

### 5. Chạy dev server
```bash
npm run dev
```
Mở [http://localhost:3000](http://localhost:3000).

## Xác thực (Azure AD / dev-login)

Đăng nhập sản xuất dùng **Azure AD SSO** (NextAuth `AzureADProvider`), giới hạn tài khoản nhân viên FPT. Cần 3 biến `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` lấy từ App Registration trên Azure Portal.

**Trạng thái hiện tại: chưa có Azure AD thật** — cả 3 biến `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` đang để trống trong `.env`. Xem hướng dẫn xin đăng ký ứng dụng tại [`docs/azure-ad-app-registration-request.md`](docs/azure-ad-app-registration-request.md) — checklist gửi cho team quản trị Azure AD/IT (redirect URI, quyền Graph API cần thiết, cách tạo client secret).

**Phát triển/test cục bộ không cần Azure AD thật**: bật `NEXT_PUBLIC_DEV_LOGIN_ENABLED=true` trong `.env` — nút "Đăng nhập với tài khoản FPT" sẽ đăng nhập bằng 2 tài khoản giả cố định:
- `user@fpt.com.vn` (đăng nhập từ trang chủ) → role `user`
- `admin@fpt.com.vn` (đăng nhập từ `/admin/login`, phải nằm trong `DEV_LOGIN_ADMIN_EMAILS`) → role `admin`

Chế độ này tự tắt ngay khi `AZURE_AD_CLIENT_ID` được cấu hình — không thể vô tình bật song song với Azure AD thật.

## Google Analytics 4

Tích hợp GA4 gồm 2 phần độc lập, cả hai đều **tuỳ chọn** (không cấu hình thì app vẫn chạy bình thường, chỉ không có số liệu):

- **Gửi sự kiện** (`campaign_view`, `template_select`, `avatar_download`) lên GA — cần `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
- **Dashboard admin đọc số liệu từ GA** (biểu đồ "downloads by unit") qua GA4 Data API — cần `GA4_PROPERTY_ID` + `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON, quyền Viewer) + custom dimension `unit` tạo sẵn trong GA4.

**Trạng thái hiện tại: chưa cấu hình** — cả 3 biến `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_PROPERTY_ID`, `GOOGLE_APPLICATION_CREDENTIALS` chưa có trong `.env` (chưa có GA4 property nào cho dự án). Hướng dẫn từng bước để xin/tạo (property, Measurement ID/Property ID, service account, custom dimension): [`docs/google-analytics-setup.md`](docs/google-analytics-setup.md).

## Lưu trữ ảnh

Ảnh khung và ảnh kết quả lưu qua abstraction `ImageStorage` (`src/lib/server/storage/`), mặc định dùng **MinIO** (tương thích S3) qua `@aws-sdk/client-s3`. Cấu hình bằng `STORAGE_PROVIDER`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_PUBLIC_URL` trong `.env`.

## Kiểm thử

- **Unit / component test** (Vitest + Testing Library, chạy trên jsdom):
  ```bash
  npm test
  ```
- **End-to-end test** (Playwright, chạy trên trình duyệt thật + DB/MinIO thật — cần hoàn tất bước "Bắt đầu nhanh" ở trên trước):
  ```bash
  npm run dev            # để server chạy ở cổng 3000 (một cửa sổ terminal khác)
  npx playwright test    # bao gồm CRUD admin, luồng public, phân quyền, FK-restrict, chữ cong...
  ```

## Cấu trúc thư mục (đầy đủ)

```
FPT-Avatar-Frame-Platform/
├── .env / .env.example              # Biến môi trường (xem các mục Xác thực, GA4, Lưu trữ ảnh ở trên)
├── docker-compose.dev.yml           # Postgres + MinIO cho local dev
├── CLAUDE.md                        # Quy ước làm việc với Claude Code trong dự án
├── README.md
├── package.json / package-lock.json
├── tsconfig.json / next.config.mjs / tailwind.config.ts / postcss.config.mjs / components.json
├── vitest.config.ts / vitest.setup.ts   # Cấu hình Vitest (unit/component test)
├── playwright.config.ts             # Cấu hình Playwright (e2e test)
│
├── prisma/
│   ├── schema.prisma                 # Model: User, Campaign, Template, GeneratedAvatar, Notification
│   ├── seed.ts                       # Dữ liệu mẫu (chiến dịch fpt38 + khung)
│   ├── seed-assets/                  # Ảnh khung dùng khi seed (frame-fpt38-orange.png, frame-tw-blue.png)
│   └── migrations/                   # Lịch sử migration (init, add_notification, add_generated_avatar_language)
│
├── public/                           # Ảnh tĩnh (logo, background trang chủ/campaign, badge header)
│
├── src/
│   ├── middleware.ts                  # Chặn truy cập /admin/* khi chưa đăng nhập
│   │
│   ├── app/                            # Next.js App Router
│   │   ├── layout.tsx, globals.css, favicon.ico
│   │   ├── campaigns-client.ts         # Hàm gọi API campaigns dùng chung phía client
│   │   ├── fonts/                      # Font Geist (tự host)
│   │   │
│   │   ├── (public)/                   # Nhóm route công khai (không tiền tố URL)
│   │   │   ├── layout.tsx, page.tsx    # Layout public + trang chủ (danh sách chiến dịch)
│   │   │   ├── campaign-cards.tsx      # Card hiển thị từng chiến dịch ở trang chủ
│   │   │   ├── c/[slug]/                # Trang tạo avatar theo chiến dịch
│   │   │   │   ├── page.tsx, layout.tsx
│   │   │   │   ├── avatar-creator.tsx   # Form chọn khung + điền overlay + tải ảnh
│   │   │   │   ├── use-avatar-canvas.ts # Hook điều khiển canvas xem trước (Fabric.js)
│   │   │   │   ├── campaign-header.tsx, campaign-footer.tsx
│   │   │   └── tai-khoan/               # Lịch sử tải ảnh của user đã đăng nhập
│   │   │       ├── page.tsx, account-history.tsx
│   │   │
│   │   ├── admin/                      # Trang quản trị
│   │   │   ├── layout.tsx               # AdminGate — chặn role khác admin
│   │   │   ├── login/page.tsx           # Đăng nhập admin (Azure AD / dev-login)
│   │   │   ├── analytics/page.tsx       # Dashboard thống kê lượt tải
│   │   │   └── campaigns/               # CRUD chiến dịch + khung ảnh
│   │   │       ├── page.tsx
│   │   │       ├── campaign-form.tsx, template-form.tsx
│   │   │       ├── photo-area-picker.tsx    # Kéo-thả chọn vùng ảnh cá nhân
│   │   │       └── curve-text-picker.tsx    # Kéo-thả đặt đường cong cho chữ overlay
│   │   │
│   │   └── api/                        # Route Handlers (REST nội bộ)
│   │       ├── auth/[...nextauth]/route.ts       # NextAuth (Azure AD + dev-login)
│   │       ├── campaigns/                        # API public: danh sách + chi tiết chiến dịch
│   │       │   ├── route.ts
│   │       │   └── [slug]/route.ts, generate/route.ts   # generate = ghép ảnh + lưu GeneratedAvatar
│   │       ├── notifications/route.ts            # Thông báo phía public
│   │       └── admin/                            # API admin (đều yêu cầu role admin)
│   │           ├── analytics/route.ts
│   │           ├── campaigns/route.ts, [slug]/route.ts
│   │           │   └── [slug]/templates/route.ts, [id]/route.ts
│   │           └── notifications/route.ts, [id]/route.ts, mark-all-read/route.ts
│   │
│   ├── components/                     # UI dùng chung giữa các trang
│   │   ├── ui/                          # Base UI (shadcn-style: button, input, label, select)
│   │   ├── admin-header.tsx, admin-shell.tsx, notification-bell.tsx
│   │   ├── public-header.tsx, public-notification-bell.tsx
│   │   └── google-analytics.tsx         # Nhúng gtag.js (no-op nếu chưa cấu hình GA)
│   │
│   └── lib/
│       ├── compositing/                  # Logic ghép ảnh + overlay DÙNG CHUNG client & server
│       │   ├── overlay-layout.ts          # resolveOverlayDraws — bố cục chữ, kể cả chữ theo đường cong
│       │   └── photo-placement.ts         # Toán vị trí/pan-zoom ảnh cá nhân trong khung
│       ├── server/                        # Code chỉ chạy phía server
│       │   ├── compositing/
│       │   │   ├── server-compositor.ts       # Render ảnh PNG cuối cùng bằng node-canvas
│       │   │   └── validate-overlay-values.ts # Kiểm tra dữ liệu overlay người dùng gửi lên
│       │   ├── storage/                   # Abstraction lưu trữ ảnh
│       │   │   ├── types.ts, index.ts, minio-storage.ts
│       │   ├── analytics/ga4-report.ts    # Đọc số liệu GA4 Data API cho dashboard admin
│       │   ├── auth-options.ts            # Cấu hình NextAuth (provider, callback gán role)
│       │   ├── session.ts, require-admin.ts, base-url.ts
│       │   ├── campaign-visibility.ts     # Điều kiện 1 chiến dịch có hiển thị công khai không
│       │   ├── notifications.ts, prisma.ts
│       ├── analytics/ga4-client.ts        # Gửi sự kiện lên GA4 (gtag), no-op nếu chưa cấu hình
│       ├── admin-i18n.tsx, public-i18n.tsx    # i18n Việt/Anh cho từng khu vực
│       ├── component-presets.ts           # Preset trường overlay phổ biến (đã style sẵn) cho admin
│       ├── localized-content.ts           # Chọn nội dung VI/EN theo displayConfig
│       ├── analytics-placeholder.ts       # Số liệu mẫu khi GA4 chưa cấu hình
│       ├── mock-fpt-auth.ts               # Đăng nhập giả lập user/admin cho dev/test cục bộ
│       └── utils.ts
│
├── tests/                              # Vitest unit/component test (đối chiếu 1-1 với src/)
│   ├── app/, components/, lib/, prisma/
│   └── middleware.test.ts, prisma-schema.test.ts
│
├── e2e/                                # Playwright end-to-end test (chạy trên server + DB thật)
│   ├── admin-campaign.spec.ts          # CRUD chiến dịch/khung, phân quyền admin
│   ├── public-avatar.spec.ts           # Luồng tạo avatar phía public
│   ├── edge-cases.spec.ts              # FK Restrict khi xoá khung/chiến dịch còn tham chiếu
│   ├── new-features.spec.ts            # Chữ theo đường cong, preset, đăng nhập user, khung vuông...
│   ├── support/                        # Helper dùng chung (env, db, auth, factories)
│   └── fixtures/                       # Ảnh mẫu dùng trong test
│
└── docs/
    ├── azure-ad-app-registration-request.md   # Checklist xin Azure AD App Registration
    ├── google-analytics-setup.md              # Hướng dẫn nối GA4 từng bước
    ├── origins/                                # Tài liệu yêu cầu/kiến trúc gốc của dự án
    └── superpowers/                            # Spec/plan thiết kế từng tính năng (lịch sử phát triển)
        ├── specs/                               # Thiết kế chi tiết (design doc)
        ├── plans/                               # Kế hoạch triển khai theo task
        └── demo/                                # Prototype UX cũ (vanilla JS, chỉ để tham khảo)
```

## Tài liệu liên quan

- [`docs/azure-ad-app-registration-request.md`](docs/azure-ad-app-registration-request.md) — xin đăng ký ứng dụng Azure AD
- [`docs/google-analytics-setup.md`](docs/google-analytics-setup.md) — nối Google Analytics 4
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — thiết kế chi tiết từng tính năng (kiến trúc campaign platform, chữ overlay theo đường cong...)
- [`CLAUDE.md`](CLAUDE.md) — quy ước làm việc với Claude Code trong dự án này
