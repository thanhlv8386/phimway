# Phimway to IINA

Script Node.js giúp stream phim trực tiếp từ Phimway sang trình phát IINA trên macOS, tự động tải phụ đề và tối ưu hóa trải nghiệm xem phim qua dòng lệnh (CLI).

## 🚀 Tính năng nổi bật
- **Tìm kiếm thông minh:** Tìm phim theo tên, ID, hoặc theo định dạng Season/Episode.
- **Tải phụ đề song song:** Sử dụng `Promise.all` để tải toàn bộ phụ đề (Việt/Anh) cùng lúc, tốc độ cực nhanh (< 1s).
- **Tích hợp IINA:** Tự động mở IINA với link stream và nạp sẵn toàn bộ file phụ đề đã tải.
- **Xử lý mượt mà:** Giao diện CLI thân thiện, hỗ trợ chọn phim/tập trực quan, thoát chương trình sạch sẽ bằng Ctrl+C.

## 📋 Hướng dẫn sử dụng nhanh

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `node phimway.js` | Chế độ tương tác (nhập tên phim thủ công) |
| `node phimway.js 322` | Mở phim hoặc tập theo ID cụ thể |
| `node phimway.js Fallout` | Tìm phim `Fallout`, ưu tiên bản Movie |
| `node phimway.js Fallout 2` | Tìm `Fallout`, mở Season 2 hoặc Episode 2 |
| `node phimway.js Fallout 2/4` | Tìm `Fallout`, phát Season 2 Episode 4 |

---

## 🔍 Chi tiết các chế độ

### 1. Chế độ tương tác
Chạy lệnh mà không truyền tham số, script sẽ hỏi bạn tên phim:
```bash
node phimway.js
```
*Kết quả:* Script sẽ hiện danh sách phim khớp nhất để bạn chọn bằng số thứ tự.

### 2. Mở theo ID
Dùng khi bạn đã biết ID của phim hoặc tập phim trên Phimway:
```bash
node phimway.js 68125
```
- Nếu ID là một tập phim: Phát luôn.
- Nếu ID là phim bộ: Hiện danh sách mùa/tập để chọn tiếp.

### 3. Tìm kiếm và phát (Auto-search)
Tìm nhanh một bộ phim. Script sẽ tự động lấy kết quả đầu tiên có độ khớp cao nhất:
```bash
node phimway.js "The Dark Knight"
```
*Gợi ý:* Nếu tên phim có khoảng trắng, hãy bọc trong dấu nháy kép.

### 4. Tìm theo Season/Episode
Script hỗ trợ cú pháp thông minh để tìm nhanh tập phim trong phim bộ:
```bash
# Tìm phim Fallout và mở Season 2
node phimway.js Fallout 2

# Tìm phim Fallout và phát ngay Season 2, Episode 4
node phimway.js Fallout 2/4
```

---

## 🛠 Yêu cầu hệ thống
- **macOS** (vì script sử dụng trình phát IINA).
- **Node.js** (phiên bản 18 trở lên).
- **IINA Player** và `iina-cli` (thường đi kèm khi cài IINA).

## 📦 Cài đặt
1. Clone hoặc tải file `phimway.js` về máy.
2. Đảm bảo bạn đã cài các dependencies (nếu có dùng thư mục `node_modules`).
3. Cấp quyền thực thi (tùy chọn): `chmod +x phimway.js`.

---
*Chúc bạn xem phim vui vẻ!*
