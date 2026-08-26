# Yêu cầu đăng ký ứng dụng Azure AD — Avatar Frame Platform

Gửi tới: Quản trị Azure AD / IT FPT
Mục đích: Kích hoạt đăng nhập bằng tài khoản FPT (Azure AD / Microsoft Entra ID) thay cho tài khoản test tạm thời (dev-login) đang dùng trong môi trường phát triển.

## 0. Trạng thái hiện tại — còn thiếu để xin

Code đã sẵn sàng nhận Azure AD thật (`AzureADProvider` trong `src/lib/server/auth-options.ts`), chỉ đang chờ 3 giá trị dưới đây — **hiện cả 3 đều để trống trong `.env`**:

| Biến `.env` | Trạng thái | Lấy từ |
|---|---|---|
| `AZURE_AD_CLIENT_ID` | ❌ Chưa có | Mục 5 dưới — sau khi IT đăng ký app |
| `AZURE_AD_CLIENT_SECRET` | ❌ Chưa có | Mục 4 + 5 dưới |
| `AZURE_AD_TENANT_ID` | ❌ Chưa có | Mục 5 dưới |

**Việc cần làm tiếp**: gửi phần "1. Thông tin ứng dụng cần đăng ký" → "4. Client secret" bên dưới cho team quản trị Azure AD/IT FPT, nhận lại 3 giá trị ở mục 5, điền vào `.env`. Khi `AZURE_AD_CLIENT_ID` được điền, app **tự động chuyển từ dev-login (giả lập) sang Azure AD thật** — không cần sửa code.

## 1. Thông tin ứng dụng cần đăng ký

- **Tên ứng dụng**: Avatar Frame Platform
- **Loại tài khoản hỗ trợ**: Chỉ tài khoản trong tổ chức FPT (Single tenant)
- **Owner / người liên hệ kỹ thuật**: _(điền tên/email người phụ trách dự án)_

## 2. Redirect URI

Khai báo loại **Web** với các URI sau:

- Bắt buộc (production): `https://<domain-production>/api/auth/callback/azure-ad`
- Tuỳ chọn (chỉ nếu cần test bằng tài khoản FPT thật ở máy dev): `http://localhost:3000/api/auth/callback/azure-ad`

> Thay `<domain-production>` bằng domain thật khi triển khai. Nếu có môi trường staging riêng, cần thêm URI tương ứng.

## 3. API permissions (Microsoft Graph — Delegated)

Chỉ cần các quyền cơ bản để lấy tên và email người dùng đăng nhập:

- `openid`
- `profile`
- `email`

Không cần các quyền cao hơn như `User.Read.All` hay quyền admin-consent khác.

## 4. Client secret

- Tạo 1 client secret cho ứng dụng.
- Ghi rõ **ngày hết hạn** của secret để đội dự án lên kế hoạch xoay vòng (rotate) trước khi hết hạn.

## 5. Thông tin cần gửi lại cho đội dự án

Sau khi đăng ký xong, vui lòng gửi lại 3 giá trị sau (qua kênh bảo mật, không gửi qua chat/email thường):

| Giá trị | Biến môi trường tương ứng |
|---|---|
| Application (client) ID | `AZURE_AD_CLIENT_ID` |
| Directory (tenant) ID | `AZURE_AD_TENANT_ID` |
| Client secret (value, không phải secret ID) | `AZURE_AD_CLIENT_SECRET` |

Các biến này sẽ được cấu hình trong file `.env` của server, không commit vào source code (xem `.env.example` trong repo).
