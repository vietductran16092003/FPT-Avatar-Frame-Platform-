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

## Cấu trúc thư mục (rút gọn)

```
src/
├── app/
│   ├── (public)/            # Trang chủ, trang chiến dịch /c/[slug], /tai-khoan
│   ├── admin/                # Trang quản trị (campaigns, analytics, login)
│   └── api/                  # Route Handlers (campaigns, admin, auth, generate...)
├── lib/
│   ├── compositing/           # Logic ghép ảnh + overlay chữ dùng chung (client & server)
│   ├── server/
│   │   ├── compositing/       # Render ảnh cuối bằng node-canvas
│   │   ├── storage/           # Abstraction lưu trữ ảnh (MinIO/S3)
│   │   └── ...                 # Prisma client, session, auth-options, analytics
│   ├── component-presets.ts   # Preset các trường overlay phổ biến cho admin
│   └── mock-fpt-auth.ts       # Đăng nhập giả lập cho dev/test cục bộ
├── components/                 # UI dùng chung (header, notification bell...)
prisma/
├── schema.prisma               # Model: User, Campaign, Template, GeneratedAvatar, Notification
└── seed.ts                     # Dữ liệu mẫu (chiến dịch fpt38 + khung)
e2e/                             # Playwright test suite (admin, public, edge case, tính năng mới)
tests/                           # Vitest unit/component test
docs/
├── azure-ad-app-registration-request.md   # Checklist xin Azure AD App Registration
├── google-analytics-setup.md              # Hướng dẫn nối GA4 từng bước
└── superpowers/                            # Spec/plan thiết kế các tính năng (lịch sử phát triển)
```

## Tài liệu liên quan

- [`docs/azure-ad-app-registration-request.md`](docs/azure-ad-app-registration-request.md) — xin đăng ký ứng dụng Azure AD
- [`docs/google-analytics-setup.md`](docs/google-analytics-setup.md) — nối Google Analytics 4
- [`docs/superpowers/specs/`](docs/superpowers/specs/) — thiết kế chi tiết từng tính năng (kiến trúc campaign platform, chữ overlay theo đường cong...)
- [`CLAUDE.md`](CLAUDE.md) — quy ước làm việc với Claude Code trong dự án này
