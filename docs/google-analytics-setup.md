# Hướng dẫn nối Google Analytics 4 (GA4) — Avatar Frame Platform

Code tích hợp GA4 đã có sẵn trong dự án. Tài liệu này hướng dẫn thao tác **bên phía Google** để lấy các giá trị cần thiết, rồi điền vào `.env`. Không cần sửa code.

Có 2 phần độc lập — bạn có thể làm phần 1 trước, phần 2 sau:

- **Phần A — Gửi dữ liệu lên GA** (event tracking): cần Measurement ID.
- **Phần B — Dashboard admin đọc số liệu từ GA**: cần Property ID + service account + custom dimension.

## Trạng thái hiện tại — còn thiếu để xin

**Cả 3 biến dưới đây hiện chưa có trong `.env`** — chưa có GA4 property nào được tạo cho dự án này:

| Biến `.env` | Trạng thái | Cần cho |
|---|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | ❌ Chưa có | Phần A — bật gửi sự kiện lên GA |
| `GA4_PROPERTY_ID` | ❌ Chưa có | Phần B — dashboard admin đọc số liệu |
| `GOOGLE_APPLICATION_CREDENTIALS` | ❌ Chưa có | Phần B — xác thực GA4 Data API |

**Việc cần xin:**
1. Ai đó có quyền tạo GA4 property cho FPT (marketing/IT nội bộ, hoặc tự tạo nếu bạn có quyền truy cập Google Analytics của tổ chức) → làm theo **Phần A** để lấy Measurement ID.
2. Nếu muốn dashboard admin đọc số liệu thật → cần thêm quyền tạo **service account** trên Google Cloud (mục B2) — nếu chưa có project Google Cloud nội bộ cho FPT, cần xin IT tạo hoặc cấp quyền truy cập vào project sẵn có.

Không có 3 giá trị này thì app vẫn chạy bình thường — chỉ không gửi/đọc được số liệu GA (theo thiết kế, xem `src/components/google-analytics.tsx` và `src/lib/server/analytics/ga4-report.ts`).

---

## Phần A — Bật event tracking (bắt buộc, làm trước)

Mục tiêu: app gửi các sự kiện `campaign_view`, `template_select`, `avatar_download` lên GA4.

### A1. Tạo GA4 property
1. Vào https://analytics.google.com → **Admin** (bánh răng góc dưới trái).
2. Cột **Property** → **Create property**. Đặt tên (vd "Avatar Frame Platform"), chọn múi giờ **(GMT+7) Vietnam**, tiền tệ VND → **Next** → điền thông tin doanh nghiệp → **Create**.

### A2. Tạo Web data stream → lấy Measurement ID
1. Trong property vừa tạo: **Admin → Data streams → Add stream → Web**.
2. Nhập URL website (vd `https://avatar.fpt.com.vn`) và tên stream → **Create stream**.
3. Màn hình stream hiện **Measurement ID** dạng **`G-XXXXXXXXXX`** → **copy lại**.

### A3. Điền vào `.env`
Mở file `.env` ở thư mục gốc dự án, điền:
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```
Khởi động lại server (`npm run dev` / build lại) để biến `NEXT_PUBLIC_*` có hiệu lực.

### A4. Kiểm tra
- Mở website, vào một campaign, tải một avatar.
- Trong GA4: **Reports → Realtime** → thấy sự kiện `campaign_view`, `avatar_download`… xuất hiện trong 1–2 phút.
- (GA4 mặc định trễ ~24–48h cho báo cáo tổng hợp, nhưng Realtime hiện ngay.)

> Nếu chỉ cần "gửi số liệu lên GA để xem trên giao diện GA" thì **Phần A là đủ**. Phần B chỉ cần khi muốn **dashboard admin trong app** tự đọc số liệu từ GA.

---

## Phần B — Dashboard admin đọc số liệu từ GA (tùy chọn)

Mục tiêu: biểu đồ **"downloads by unit"** trên trang `/admin/analytics` lấy dữ liệu thật từ GA4 (qua GA4 Data API). Chưa cấu hình thì phần này để trống, các số liệu khác (từ database) vẫn chạy.

### B1. Lấy Property ID (số)
1. GA4 **Admin → Property Settings** (hoặc **Property details**).
2. Copy **PROPERTY ID** — là **dãy số** (vd `123456789`), KHÁC với Measurement ID `G-...`.

### B2. Tạo service account trên Google Cloud
1. Vào https://console.cloud.google.com → chọn (hoặc tạo) một project.
2. **APIs & Services → Library** → tìm **"Google Analytics Data API"** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   - Đặt tên (vd `ga4-reader`) → **Create and continue** → bỏ qua các bước role (không cần) → **Done**.
4. Vào service account vừa tạo → tab **Keys → Add key → Create new key → JSON** → tải file `.json` về máy.
   - **Lưu file này ở nơi an toàn** (vd `D:\secrets\ga4-service-account.json`). Đây là **secret**, không commit lên git.
5. Copy **email của service account** (dạng `ga4-reader@<project>.iam.gserviceaccount.com`).

### B3. Cấp quyền cho service account trên GA4 property
1. GA4 **Admin → Property Access Management → +** (thêm người dùng).
2. Dán **email service account** ở bước B2.5, chọn quyền **Viewer** → **Add**.

### B4. Tạo custom dimension "unit"
Biểu đồ "downloads by unit" dựa trên một custom dimension tên `unit`.
1. GA4 **Admin → Custom definitions → Create custom dimension**.
2. Điền:
   - **Dimension name**: `unit`
   - **Scope**: **Event**
   - **Event parameter**: `unit`
3. **Save**.

> Lưu ý: custom dimension **không hồi tố** — chỉ áp cho các event gửi **sau khi** tạo dimension. Tạo càng sớm càng tốt.

### B5. Điền vào `.env`
```
GA4_PROPERTY_ID=123456789
GOOGLE_APPLICATION_CREDENTIALS=D:\secrets\ga4-service-account.json
```
Khởi động lại server. (Hai biến này chỉ dùng ở server nên không cần prefix `NEXT_PUBLIC_`.)

### B6. Kiểm tra
- Vào `/admin/analytics`. Sau khi đã có vài lượt tải avatar (với trường "Đơn vị công tác" được chọn) và chờ GA xử lý, biểu đồ "downloads by unit" sẽ hiện số liệu thật.
- Nếu cấu hình sai/thiếu, dashboard tự động hiện placeholder thay vì lỗi (theo thiết kế của `ga4-report.ts`).

---

## Bảng tổng hợp biến `.env`

| Biến | Giá trị lấy từ | Dùng cho |
|---|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Measurement ID `G-XXXX` (A2) | Gửi event lên GA (client) |
| `GA4_PROPERTY_ID` | Property ID dạng số (B1) | Dashboard đọc GA (server) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Đường dẫn file JSON key (B2.4) | Xác thực GA4 Data API |

## Bảo mật
- File JSON service account là **secret** — lưu ngoài repo, không commit. Kiểm tra `.gitignore` đã bỏ qua các file `*.json` key / thư mục secrets.
- Không dán nội dung key vào chat hay commit message.
- Measurement ID (`G-...`) không phải secret (nó lộ ra ở client), nhưng Property ID và key thì nên giữ kín.

---

Sau khi bạn hoàn tất bên Google, đưa tôi 3 giá trị (Measurement ID, Property ID, đường dẫn file JSON) — tôi sẽ điền vào `.env` và verify tracking + dashboard giúp bạn.
